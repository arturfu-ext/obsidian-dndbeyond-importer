import { describe, expect, it } from "vitest";
import { DdbClient, HttpRequest, HttpResponse, normalizeCobalt, tokenUserName } from "../src/ddb-client";

const CHARACTER = { data: { id: 1, name: "Bragna" } };

const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims))}.y`;

function fakeHttp(routes: { auth?: () => HttpResponse; character: (req: HttpRequest) => HttpResponse }) {
	const calls: HttpRequest[] = [];
	const http = async (req: HttpRequest) => {
		calls.push(req);
		if (req.url.includes("auth-service")) return routes.auth!();
		return routes.character(req);
	};
	return { http, calls };
}

const goodAuth = () => ({ status: 200, json: { token: "tok", ttl: 1800 } });
const ok = () => ({ status: 200, json: CHARACTER });

describe("normalizeCobalt", () => {
	it.each<[string | null, string]>([
		["abc", "abc"],
		["  abc\n", "abc"],
		["CobaltSession=abc", "abc"],
		["CobaltSession=abc; Path=/", "abc"],
		['"abc"', "abc"],
		[null, ""],
	])("%j -> %j", (input, out) => {
		expect(normalizeCobalt(input)).toBe(out);
	});
});

describe("tokenUserName", () => {
	it("reads the name claim", () => {
		const claim = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
		expect(tokenUserName(jwt({ [claim]: "artur" }))).toBe("artur");
	});

	it("tolerates garbage", () => {
		expect(tokenUserName("nope")).toBeNull();
	});
});

describe("DdbClient", () => {
	it("reads anonymously without a cookie", async () => {
		const { http, calls } = fakeHttp({ character: ok });
		const out = await new DdbClient(http, () => null).fetchCharacter("1");
		expect(out.data).toEqual(CHARACTER);
		expect(calls).toHaveLength(1);
		expect(calls[0].headers["Authorization"]).toBeUndefined();
	});

	it("trades the cookie for a bearer token", async () => {
		const { http, calls } = fakeHttp({ auth: goodAuth, character: ok });
		await new DdbClient(http, () => "CobaltSession=sess").fetchCharacter("1");
		expect(calls[0].headers["Cookie"]).toBe("CobaltSession=sess");
		expect(calls[1].headers["Authorization"]).toBe("Bearer tok");
		expect(calls[1].headers["Cookie"]).toBeUndefined();
	});

	it("reuses the token until shortly before it expires", async () => {
		let now = 0;
		const { http, calls } = fakeHttp({ auth: goodAuth, character: ok });
		const client = new DdbClient(http, () => "sess", () => now);
		await client.fetchCharacter("1");
		await client.fetchCharacter("1");
		expect(calls.filter((c) => c.url.includes("auth-service"))).toHaveLength(1);
		now = 1800 * 1000;
		await client.fetchCharacter("1");
		expect(calls.filter((c) => c.url.includes("auth-service"))).toHaveLength(2);
	});

	it("drops the token when the cookie changes", async () => {
		let cookie = "one";
		const { http, calls } = fakeHttp({ auth: goodAuth, character: ok });
		const client = new DdbClient(http, () => cookie);
		await client.fetchCharacter("1");
		cookie = "two";
		await client.fetchCharacter("1");
		expect(calls.filter((c) => c.url.includes("auth-service")).map((c) => c.headers["Cookie"])).toEqual([
			"CobaltSession=one",
			"CobaltSession=two",
		]);
	});

	it("treats a 200 with a null token as a rejected cookie, and still reads public sheets", async () => {
		const { http } = fakeHttp({ auth: () => ({ status: 200, json: { token: null, ttl: 1800 } }), character: ok });
		const out = await new DdbClient(http, () => "stale").fetchCharacter("1");
		expect(out.data).toEqual(CHARACTER);
		expect(out.warning).toMatch(/expired/);
	});

	it("explains a rejected cookie on a private sheet", async () => {
		const { http } = fakeHttp({
			auth: () => ({ status: 200, json: { token: null } }),
			character: () => ({ status: 403, json: null }),
		});
		await expect(new DdbClient(http, () => "stale").fetchCharacter("1")).rejects.toThrow(/expired.*isn't public/);
	});

	it("points at the cookie setting when a private sheet is read anonymously", async () => {
		const { http } = fakeHttp({ character: () => ({ status: 403, json: null }) });
		await expect(new DdbClient(http, () => null).fetchCharacter("1")).rejects.toThrow(/Add your CobaltSession/);
	});

	it("blames the account when a valid token can't see the sheet", async () => {
		const { http } = fakeHttp({ auth: goodAuth, character: () => ({ status: 403, json: null }) });
		await expect(new DdbClient(http, () => "sess").fetchCharacter("1")).rejects.toThrow(/account behind your cookie/);
	});

	it("retries once with a new token after a 401", async () => {
		let attempts = 0;
		const { http, calls } = fakeHttp({
			auth: goodAuth,
			character: () => (++attempts === 1 ? { status: 401, json: null } : ok()),
		});
		const out = await new DdbClient(http, () => "sess").fetchCharacter("1");
		expect(out.data).toEqual(CHARACTER);
		expect(calls.filter((c) => c.url.includes("auth-service"))).toHaveLength(2);
	});

	it("never puts the cookie on the character request or in its errors", async () => {
		const { http, calls } = fakeHttp({ auth: goodAuth, character: () => ({ status: 403, json: null }) });
		const err = await new DdbClient(http, () => "s3cret").fetchCharacter("1").catch((e: Error) => e);
		expect(String(err)).not.toContain("s3cret");
		expect(JSON.stringify(calls.filter((c) => !c.url.includes("auth-service")))).not.toContain("s3cret");
	});

	it("names the account in describeAccount", async () => {
		const token = jwt({ name: "artur" });
		const { http } = fakeHttp({ auth: () => ({ status: 200, json: { token } }), character: ok });
		await expect(new DdbClient(http, () => "sess").describeAccount()).resolves.toBe("artur");
	});

	it("rejects describeAccount with no cookie", async () => {
		const { http } = fakeHttp({ character: ok });
		await expect(new DdbClient(http, () => "").describeAccount()).rejects.toThrow(/No cookie/);
	});
});

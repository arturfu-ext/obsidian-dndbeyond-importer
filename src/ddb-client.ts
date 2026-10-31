import type { DdbApiResponse } from "./character";

const AUTH_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const CHARACTER_URL = "https://character-service.dndbeyond.com/character/v5/character";

export interface HttpRequest {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
}

export interface HttpResponse {
	status: number;
	json: unknown;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

export class DdbFetchError extends Error {}

export interface FetchedCharacter {
	data: DdbApiResponse;
	// Set when the cookie was rejected but the sheet could still be read publicly.
	warning?: string;
}

const COOKIE_REJECTED =
	"D&D Beyond rejected your CobaltSession cookie. It has probably expired: copy a new one into the plugin settings.";

// People paste this in all sorts of shapes, usually straight from devtools.
export function normalizeCobalt(raw: string | null | undefined): string {
	return (raw ?? "")
		.trim()
		.replace(/^CobaltSession=/i, "")
		.replace(/;.*$/, "")
		.replace(/^["']|["']$/g, "")
		.trim();
}

// Reads the display name out of the token's claims. Nothing depends on this beyond
// showing who the cookie belongs to, so any surprise in the format just yields null.
export function tokenUserName(token: string): string | null {
	try {
		const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
		const claims = JSON.parse(atob(payload)) as Record<string, unknown>;
		const key = Object.keys(claims).find((k) => k === "name" || k.endsWith("/claims/name"));
		const name = key ? claims[key] : null;
		return typeof name === "string" ? name : null;
	} catch {
		return null;
	}
}

// Talks to D&D Beyond the way ddb-importer's proxy does: trade the CobaltSession
// cookie for a short-lived bearer token, then read the character as that user. With
// no cookie the same endpoint still serves sheets set to Public.
export class DdbClient {
	private token: { value: string; expires: number; cookie: string } | null = null;

	constructor(
		private http: HttpClient,
		private getCookie: () => string | null,
		private now: () => number = Date.now
	) {}

	private async getToken(): Promise<string | null> {
		const cookie = normalizeCobalt(this.getCookie());
		if (!cookie) return null;
		if (this.token && this.token.cookie === cookie && this.token.expires > this.now()) return this.token.value;
		this.token = null;

		const resp = await this.http({
			url: AUTH_URL,
			method: "POST",
			headers: { Accept: "application/json", Cookie: `CobaltSession=${cookie}` },
		});
		// A bad cookie comes back as 200 with {"token":null}, not as a 401.
		const body = resp.json as { token?: string | null; ttl?: number } | null;
		if (resp.status !== 200 || !body?.token) throw new DdbFetchError(COOKIE_REJECTED);
		const ttlMs = (body.ttl ?? 300) * 1000;
		this.token = { value: body.token, expires: this.now() + ttlMs - 60_000, cookie };
		return body.token;
	}

	private getCharacter(id: string, token: string | null): Promise<HttpResponse> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (token) headers["Authorization"] = `Bearer ${token}`;
		return this.http({ url: `${CHARACTER_URL}/${id}?includeCustomItems=true`, method: "GET", headers });
	}

	async fetchCharacter(id: string): Promise<FetchedCharacter> {
		let token: string | null = null;
		let warning: string | undefined;
		try {
			token = await this.getToken();
		} catch (e) {
			if (!(e instanceof DdbFetchError)) throw e;
			warning = e.message;
		}

		let resp = await this.getCharacter(id, token);
		if (resp.status === 401 && token) {
			// The token died early. Get a new one and try once more.
			this.token = null;
			token = await this.getToken();
			resp = await this.getCharacter(id, token);
		}

		const data = resp.json as DdbApiResponse | null;
		if (resp.status === 200 && data?.data) return { data, warning };

		if (warning) throw new DdbFetchError(`${warning} Character ${id} isn't public, so it can't be read without one.`);
		if (token) {
			throw new DdbFetchError(
				`The D&D Beyond account behind your cookie can't read character ${id} (HTTP ${resp.status}). It must be yours or visible to you.`
			);
		}
		throw new DdbFetchError(
			`Character ${id} isn't public (HTTP ${resp.status}). Add your CobaltSession cookie in the plugin settings to read private sheets, or set the sheet to Public.`
		);
	}

	// Checks the cookie for the settings tab and says who it belongs to.
	async describeAccount(): Promise<string> {
		this.token = null;
		const token = await this.getToken();
		if (!token) throw new DdbFetchError("No cookie set.");
		return tokenUserName(token) ?? "your D&D Beyond account";
	}
}

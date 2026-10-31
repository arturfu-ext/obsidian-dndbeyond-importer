import { describe, expect, it } from "vitest";
import {
	buildFeatures,
	buildMarkdown,
	calcAC,
	calcInitiative,
	calcSpeed,
	computeRawStats,
	DdbCharacter,
	DEFAULT_SETTINGS,
	getAllModifiers,
	getClassFeatures,
	getVisibleFeats,
	getVisibleRacialTraits,
	resolveHPState,
	syncedHPState,
} from "../src/character";

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) =>
	[str, dex, con, int, wis, cha].map((value, i) => ({ id: i + 1, value }));

const barbarian = (): DdbCharacter => ({
	id: 1,
	name: 'Grog "the Strongjaw"',
	baseHitPoints: 19,
	removedHitPoints: 14,
	temporaryHitPoints: 0,
	stats: scores(18, 12, 14, 7, 11, 12),
	bonusStats: [],
	overrideStats: [],
	classes: [
		{
			level: 2,
			definition: { name: "Barbarian" },
			classFeatures: [
				{ definition: { name: "Core Barbarian Traits", requiredLevel: 1 } },
				{ definition: { name: "Rage", requiredLevel: 1, description: "<p>You can rage.</p>" } },
				{ definition: { name: "Reckless Attack", requiredLevel: 2 } },
				{ definition: { name: "Extra Attack", requiredLevel: 5 } },
				{ definition: { name: "Secret Thing", requiredLevel: 1, hideInSheet: true } },
			],
		},
	],
	modifiers: {
		class: [{ type: "set", subType: "unarmored-armor-class", statId: 3, value: null, isGranted: true }],
		feat: [{ type: "bonus", subType: "constitution-score", value: 1 }],
	},
	race: {
		fullName: "Orc",
		weightSpeeds: { normal: { walk: 30 } },
		racialTraits: [
			{ definition: { name: "Relentless Endurance" } },
			{ definition: { name: "Languages", hideInSheet: true } },
			{ definition: { name: "Ability Score Increases" } },
		],
	},
	feats: [
		{ definition: { name: "Savage Attacker", categories: [{ tagName: "Origin" }] } },
		{ definition: { name: "Soldier Ability Score Improvements", categories: [{ tagName: "__INITIAL_ASI" }] } },
		{ definition: { name: "Dark Bargain", categories: [{ tagName: "__DISGUISE_FEAT" }] } },
	],
});

const statsById = (char: DdbCharacter) => {
	const s = computeRawStats(char);
	return { 1: s.str, 2: s.dex, 3: s.con, 4: s.int, 5: s.wis, 6: s.cha };
};

const ac = (char: DdbCharacter) => {
	const stats = statsById(char);
	return calcAC(char, stats[2], stats, getAllModifiers(char));
};

describe("armor class", () => {
	it("applies Unarmored Defense through its statId", () => {
		expect(ac(barbarian())).toBe(13); // 10 + DEX 1 + CON 2
	});

	it("keeps the unarmored bonus with a shield but not with armor", () => {
		const shield = barbarian();
		shield.inventory = [{ equipped: true, definition: { armorClass: 2, armorTypeId: 4 } }];
		expect(ac(shield)).toBe(15);

		const armored = barbarian();
		armored.inventory = [{ equipped: true, definition: { armorClass: 11, armorTypeId: 1 } }];
		expect(ac(armored)).toBe(12);
	});

	it("honors the sheet's AC override and bonus boxes", () => {
		const override = barbarian();
		override.characterValues = [{ typeId: 1, value: 21 }];
		expect(ac(override)).toBe(21);

		const bonus = barbarian();
		bonus.characterValues = [{ typeId: 3, value: 2 }];
		expect(ac(bonus)).toBe(15);
	});

	it("only counts Defense style in armor", () => {
		const char = barbarian();
		char.modifiers!.class!.push({ type: "bonus", subType: "armored-armor-class", value: 1 });
		expect(ac(char)).toBe(13);
		char.inventory = [{ equipped: true, definition: { armorClass: 11, armorTypeId: 1 } }];
		expect(ac(char)).toBe(13); // 11 + DEX 1 + 1
	});
});

describe("item modifiers", () => {
	const ring = { type: "bonus", subType: "armor-class", value: 1 };

	it("ignores an unattuned item", () => {
		const char = barbarian();
		char.inventory = [{ equipped: true, isAttuned: false, definition: { canEquip: true, canAttune: true, grantedModifiers: [ring] } }];
		expect(ac(char)).toBe(13);
	});

	it("counts an equipped and attuned item", () => {
		const char = barbarian();
		char.inventory = [{ equipped: true, isAttuned: true, definition: { canEquip: true, canAttune: true, grantedModifiers: [ring] } }];
		expect(ac(char)).toBe(14);
	});

	it("ignores modifiers.item, which also lists items not in use", () => {
		const char = barbarian();
		char.modifiers!.item = [ring];
		expect(ac(char)).toBe(13);
	});
});

describe("speed and initiative", () => {
	it("adds a walking bonus and Fast Movement outside heavy armor", () => {
		const char = barbarian();
		char.modifiers!.class!.push({ type: "bonus", subType: "speed", value: 10, restriction: "while you aren't wearing heavy armor" });
		expect(calcSpeed(char, getAllModifiers(char))).toBe(40);
		char.inventory = [{ equipped: true, definition: { armorClass: 18, armorTypeId: 3 } }];
		expect(calcSpeed(char, getAllModifiers(char))).toBe(30);
	});

	it("adds initiative bonuses to DEX", () => {
		const char = barbarian();
		char.modifiers!.feat!.push({ type: "bonus", subType: "initiative", value: 2 });
		const stats = statsById(char);
		expect(calcInitiative(stats[2], stats, getAllModifiers(char))).toBe(3);
	});
});

describe("feature filtering", () => {
	it("drops D&D Beyond's internal feats such as Dark Bargain", () => {
		expect(getVisibleFeats(barbarian()).map((f) => f.definition?.name)).toEqual(["Savage Attacker"]);
	});

	it("drops character-creation racial traits", () => {
		expect(getVisibleRacialTraits(barbarian()).map((t) => t.definition?.name)).toEqual(["Relentless Endurance"]);
	});

	it("caps class features at the character's level", () => {
		expect(getClassFeatures(barbarian().classes![0]).map((d) => d.name)).toEqual(["Rage", "Reckless Attack"]);
	});

	it("includes subclass features without duplicates", () => {
		const cls = barbarian().classes![0];
		cls.classFeatures!.push({ definition: { name: "Frenzy", requiredLevel: 2 } });
		cls.subclassDefinition = {
			name: "Berserker",
			classFeatures: [{ name: "Frenzy", requiredLevel: 2 }, { name: "Retaliation", requiredLevel: 10 }],
		};
		expect(getClassFeatures(cls).map((d) => d.name)).toEqual(["Rage", "Reckless Attack", "Frenzy"]);
	});

	it("writes class features into the note and leaves hidden feats out", () => {
		const md = buildFeatures(barbarian());
		expect(md).toContain("### Barbarian Features");
		expect(md).toContain("**Rage**");
		expect(md).not.toContain("Dark Bargain");
		expect(md).not.toContain("Extra Attack");
	});
});

describe("note generation", () => {
	it("writes HP and escapes quotes in frontmatter", () => {
		const md = buildMarkdown({ data: barbarian() }, DEFAULT_SETTINGS);
		expect(md).toContain('name: "Grog \\"the Strongjaw\\""');
		expect(md).toContain("hp: 23");
		expect(md).toContain("hp_current: 9");
		expect(md).toContain("ac: 13");
		expect(md).toContain("currentHp:9");
	});
});

describe("HP tracker state", () => {
	const seed = () => JSON.stringify(resolveHPState(undefined, 20, 20, 0));

	// The upstream bug: the first render cached the note's HP, and every later render
	// preferred that cache, so refreshing never reached the tracker.
	it("takes a refreshed note value over the cached state", () => {
		const state = resolveHPState(seed(), 20, 17, 0);
		expect(state.current).toBe(17);
	});

	it("keeps local tracker changes while the note is unchanged", () => {
		const local = { ...resolveHPState(undefined, 20, 20, 0), current: 5 };
		expect(resolveHPState(JSON.stringify(local), 20, 20, 0).current).toBe(5);
	});

	it("keeps the log and death saves when the note wins", () => {
		const local = { ...resolveHPState(undefined, 20, 20, 0), current: 5, dsF: 2, log: ["hit"] };
		const state = resolveHPState(JSON.stringify(local), 20, 17, 0);
		expect(state).toMatchObject({ current: 17, dsF: 2, log: ["hit"] });
	});

	it("adopts state saved by the sheet before any widget stamped it", () => {
		const saved = JSON.stringify({ max: 20, current: 4, temp: 0, dsS: 0, dsF: 0, log: [] });
		expect(resolveHPState(saved, 20, 20, 0)).toMatchObject({ current: 4, noteCurrent: 20 });
	});

	it("survives corrupt state", () => {
		expect(resolveHPState("{nope", 20, 17, 0).current).toBe(17);
	});

	it("overwrites a local value on refresh even if the note text is unchanged", () => {
		const char = barbarian();
		const stats = computeRawStats(char);
		const local = { ...resolveHPState(undefined, 23, 9, 0), current: 1 };
		const state = syncedHPState(JSON.stringify(local), char, stats, "12:00");
		expect(state).toMatchObject({ current: 9, max: 23, noteCurrent: 9 });
		expect(state.log[0]).toContain("9 / 23");
		// The widget then agrees with the (unchanged) note instead of reseeding.
		expect(resolveHPState(JSON.stringify(state), 23, 9, 0).current).toBe(9);
	});

	it("doesn't log a refresh that changed nothing", () => {
		const char = barbarian();
		const local = resolveHPState(undefined, 23, 9, 0);
		expect(syncedHPState(JSON.stringify(local), char, computeRawStats(char), "12:00").log).toEqual([]);
	});

	it("reads death saves from D&D Beyond", () => {
		const char = barbarian();
		char.deathSaves = { successCount: 1, failCount: 2 };
		expect(syncedHPState(undefined, char, computeRawStats(char), "12:00")).toMatchObject({ dsS: 1, dsF: 2 });
	});
});

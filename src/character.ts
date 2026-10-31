export interface DnDBeyondImporterSettings {
	outputFolder: string;
	includeSpells: boolean;
	includeEquipment: boolean;
	includeFeatures: boolean;
	includeBackstory: boolean;
	// Name of the Obsidian secret holding the CobaltSession cookie. The cookie itself
	// lives in Obsidian's secret storage, never in data.json.
	cobaltSecret: string;
	// 5etools integration (disabled by default)
	fiveEtoolsEnabled: boolean;
	fiveEtoolsBaseUrl: string;
}

export interface HPState {
	max: number;
	current: number;
	temp: number;
	dsS: number;
	dsF: number;
	log: string[];
	// The note values this state was last seeded from. When the note changes
	// underneath us (a refresh, a git pull) the note wins over the local tracker.
	noteCurrent?: number;
	noteTemp?: number;
}

export interface DiceRoll {
	die: string;
	result: number;
	modifier: number;
	label: string;
	timestamp: string;
}

export interface CharacterAction {
	name: string;
	attackBonus: number | null;
	damageDice: string | null;
	damageBonus: number;
	range: string;
	notes: string;
	isSpell: boolean;
}

// ─── Typed interfaces for D&D Beyond API response ─────────────────────────────

export interface DdbStat {
	id: number;
	value: number | null;
}

export interface DdbModifier {
	type: string;
	subType: string;
	friendlySubtypeName?: string;
	restriction?: string | null;
	value?: number | null;
	id?: number | string;
	statId?: number | null;
	isGranted?: boolean;
}

export interface DdbModifiers {
	class?: DdbModifier[];
	race?: DdbModifier[];
	background?: DdbModifier[];
	feat?: DdbModifier[];
	item?: DdbModifier[];
	condition?: DdbModifier[];
}

export interface DdbDefinition {
	name?: string;
	description?: string;
	level?: number;
	school?: string;
	activation?: { activationTime?: number; activationType?: number };
	range?: { rangeValue?: number; origin?: string };
	concentration?: boolean;
	armorClass?: number;
	armorTypeId?: number;
	weight?: number;
	categories?: { tagName?: string }[];
	hideInSheet?: boolean;
	requiredLevel?: number;
	canEquip?: boolean;
	canAttune?: boolean;
	isConsumable?: boolean;
	grantedModifiers?: DdbModifier[];
}

export interface DdbSpell {
	definition?: DdbDefinition;
	prepared?: boolean;
}

export interface DdbClassSpell {
	spells?: DdbSpell[];
}

export interface DdbInventoryItem {
	definition?: DdbDefinition;
	equipped?: boolean;
	isAttuned?: boolean;
	quantity?: number;
}

export interface DdbRacialTrait {
	definition?: DdbDefinition;
}

export interface DdbFeat {
	definition?: DdbDefinition;
}

export interface DdbRace {
	fullName?: string;
	baseName?: string;
	weightSpeeds?: { normal?: { walk?: number } };
	racialTraits?: DdbRacialTrait[];
}

export interface DdbClass {
	level?: number;
	definition?: { name?: string };
	classFeatures?: { definition?: DdbDefinition }[];
	subclassDefinition?: { name?: string; classFeatures?: DdbDefinition[] } | null;
	stats?: DdbStat[];
	overrideStats?: DdbStat[];
	bonusStats?: DdbStat[];
	modifiers?: DdbModifiers;
}

export interface DdbBackground {
	definition?: { name?: string };
}

export interface DdbTraits {
	personalityTraits?: string;
	ideals?: string;
	bonds?: string;
	flaws?: string;
	appearance?: string;
}

export interface DdbNotes {
	backstory?: string;
	personalityTraits?: string;
	allies?: string;
	enemies?: string;
	otherNotes?: string;
}

export interface DdbSpellSlot {
	level?: number;
	used?: number;
	max?: number;
}

export interface DdbCurrencies {
	cp?: number;
	sp?: number;
	ep?: number;
	gp?: number;
	pp?: number;
}

export interface DdbCharacter {
	id: number;
	name?: string;
	avatarUrl?: string;
	currentXp?: number;
	alignmentId?: number;
	baseHitPoints?: number;
	bonusHitPoints?: number;
	overrideHitPoints?: number;
	removedHitPoints?: number;
	temporaryHitPoints?: number;
	deathSaves?: { successCount?: number | null; failCount?: number | null };
	characterValues?: { typeId?: number; value?: number | string | null }[];
	race?: DdbRace;
	classes?: DdbClass[];
	stats?: DdbStat[];
	overrideStats?: DdbStat[];
	bonusStats?: DdbStat[];
	modifiers?: DdbModifiers;
	background?: DdbBackground;
	inventory?: DdbInventoryItem[];
	feats?: DdbFeat[];
	traits?: DdbTraits;
	currencies?: DdbCurrencies;
	classSpells?: DdbClassSpell[];
	spells?: Record<string, DdbSpell[]>;
	spellSlots?: DdbSpellSlot[] | Record<string, DdbSpellSlot>;
	notes?: DdbNotes;
}

export interface DdbApiResponse {
	data?: DdbCharacter;
}

export const DEFAULT_SETTINGS: DnDBeyondImporterSettings = {
	outputFolder: "Characters",
	includeSpells: true,
	includeEquipment: true,
	includeFeatures: true,
	includeBackstory: true,
	cobaltSecret: "",
	fiveEtoolsEnabled: false,
	fiveEtoolsBaseUrl: "https://5e.tools",
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

export function modStr(score: number): string {
	const mod = Math.floor((score - 10) / 2);
	return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function profBonus(level: number): number {
	return Math.ceil(level / 4) + 1;
}

export function getStatValue(
	stats: DdbStat[],
	overrides: DdbStat[],
	bonuses: DdbStat[],
	id: number
): number {
	const base = stats.find((s) => s.id === id)?.value ?? 10;
	const override = overrides.find((s) => s.id === id)?.value;
	if (override != null) return override;
	const bonus = bonuses
		.filter((b) => b.id === id)
		.reduce((acc, b) => acc + (b.value ?? 0), 0);
	return (base ?? 10) + bonus;
}

/**
 * Returns every modifier granted to a character from all sources:
 * class, race, background, feats, and equipped/attuned items.
 * Use this instead of re-building the spread in every function.
 */
export function getAllModifiers(char: DdbCharacter): DdbModifier[] {
	return [
		...(char.modifiers?.class ?? []),
		...(char.modifiers?.race ?? []),
		...(char.modifiers?.background ?? []),
		...(char.modifiers?.feat ?? []),
		...getActiveItemModifiers(char),
	];
}

// An item's modifiers only count while it's in use, which modifiers.item doesn't
// tell us, so read them off the inventory instead.
function getActiveItemModifiers(char: DdbCharacter): DdbModifier[] {
	const mods: DdbModifier[] = [];
	for (const item of char.inventory ?? []) {
		const def = item.definition;
		if (!def?.grantedModifiers) continue;
		const active =
			(!def.canEquip && !def.canAttune && !def.isConsumable) ||
			(item.isAttuned && (item.equipped || !def.canEquip)) ||
			(!def.canAttune && item.equipped);
		if (active) mods.push(...def.grantedModifiers);
	}
	return mods;
}

// Advantage/disadvantage on a saving throw or skill check. Checks both the
// specific subType (e.g. "perception") and the broad subType D&D Beyond uses
// for blanket grants (e.g. "saving-throws" / "ability-checks"). Per 5e rules,
// if a creature has both advantage and disadvantage on the same roll they
// cancel out, so that case resolves to "none" — same as having neither.
// Every roll always resolves to one of the three states; nothing is ever
// "no status" — it's an explicit import of what D&D Beyond reports.
export type AdvState = "advantage" | "disadvantage" | "none";

export function getAdvantageState(allMods: DdbModifier[], subType: string, broadSubType: string): AdvState {
	const hasAdv = allMods.some((m) => m.type === "advantage" && (m.subType === subType || m.subType === broadSubType));
	const hasDis = allMods.some((m) => m.type === "disadvantage" && (m.subType === subType || m.subType === broadSubType));
	if (hasAdv && hasDis) return "none";
	if (hasAdv) return "advantage";
	if (hasDis) return "disadvantage";
	return "none";
}

// Always renders a marker — every roll has an explicit imported status,
// including "none", not just the advantage/disadvantage cases.
export function formatAdvMarkerMd(advState: AdvState): string {
	if (advState === "advantage") return ` <span style="color:#22c55e;font-weight:700;">▲A</span>`;
	if (advState === "disadvantage") return ` <span style="color:#ef4444;font-weight:700;">▼D</span>`;
	return ` <span style="color:#9ca3af;">–N</span>`;
}

export function calcHP(char: DdbCharacter, conScore: number, totalLevel: number, allMods: DdbModifier[]): { max: number; current: number; temp: number } {
	const base = char.baseHitPoints ?? 0;
	const bonus = char.bonusHitPoints ?? 0;
	const override = char.overrideHitPoints;
	const removedHp = char.removedHitPoints ?? 0;
	const temp = char.temporaryHitPoints ?? 0;
	const conMod = Math.floor((conScore - 10) / 2);
	// Per-level HP bonuses (Tough feat +2/level, Dwarven Toughness +1/level, etc.)
	const hpPerLevel = allMods
		.filter((m) => m.type === "bonus" && m.subType === "hit-points-per-level" && m.value != null)
		.reduce((sum, m) => sum + (m.value ?? 0), 0);
	// Flat HP bonuses
	const flatHp = allMods
		.filter((m) => m.type === "bonus" && m.subType === "hit-points" && m.value != null)
		.reduce((sum, m) => sum + (m.value ?? 0), 0);
	// If the user has manually overridden HP in D&D Beyond we use that value as-is.
	// This intentionally skips Con-mod scaling, Tough/Dwarven Toughness bonuses, and
	// flatHp — the override is the user's explicit total, not a base to add on top of.
	const max = override != null ? override : base + bonus + conMod * totalLevel + hpPerLevel * totalLevel + flatHp;
	return { max, current: max - removedHp, temp };
}

export function calcLevel(classes: DdbClass[]): number {
	return classes.reduce((sum, c) => sum + (c.level ?? 0), 0);
}

export function calcAC(char: DdbCharacter, dexScore: number, allStats: Record<number, number>, allMods: DdbModifier[]): number {
	// characterValues typeId 1 is the "override AC" box on the sheet.
	const override = (char.characterValues ?? []).find((v) => v.typeId === 1 && v.value != null);
	if (override) return Number(override.value);

	const dexMod = Math.floor((dexScore - 10) / 2);
	let bestAC = 10 + dexMod;
	let shieldBonus = 0;
	let wearingArmor = false;
	for (const item of char.inventory ?? []) {
		const def = item.definition;
		if (!def || !item.equipped) continue;
		if (def.armorClass) {
			if (def.armorTypeId === 4) {
				shieldBonus = Math.max(shieldBonus, def.armorClass);
			} else {
				wearingArmor = true;
				const addDex = def.armorTypeId !== 3;
				const maxDex = def.armorTypeId === 2 ? 2 : 999;
				const ac = def.armorClass + (addDex ? Math.min(dexMod, maxDex) : 0);
				if (ac > bestAC) bestAC = ac;
			}
		}
	}
	// Unarmored Defense and friends. Shields are NOT armor (armorTypeId 4 is tracked
	// separately as shieldBonus), so wearingArmor stays false when only a shield is
	// equipped. statId names the extra ability (Barbarian CON, Monk WIS); fixed-value
	// grants (Draconic Resilience) use value instead.
	if (!wearingArmor) {
		for (const m of allMods) {
			if (m.type !== "set" || m.subType !== "unarmored-armor-class" || m.isGranted === false) continue;
			const extra = m.statId != null ? Math.floor(((allStats[m.statId] ?? 10) - 10) / 2) : (m.value ?? 0);
			bestAC = Math.max(bestAC, 10 + dexMod + extra);
		}
	}
	for (const m of allMods) {
		if (m.type !== "bonus" || m.value == null) continue;
		// Flat AC bonuses: feats, magic items, etc.
		if (m.subType === "armor-class") bestAC += m.value;
		// Defense fighting style applies only in armor.
		if (m.subType === "armored-armor-class" && wearingArmor) bestAC += m.value;
		if (m.subType === "unarmored-armor-class" && !wearingArmor) bestAC += m.value;
	}
	// characterValues typeId 2 and 3 are the sheet's magic and misc AC bonus boxes.
	for (const v of char.characterValues ?? []) {
		if (v.typeId === 2 || v.typeId === 3) bestAC += Number(v.value ?? 0);
	}
	return bestAC + shieldBonus;
}

export function calcSpeed(char: DdbCharacter, allMods: DdbModifier[]): number {
	let speed = char.race?.weightSpeeds?.normal?.walk ?? 30;
	const worn = (char.inventory ?? []).filter((i) => i.equipped && i.definition?.armorClass);
	const inHeavyArmor = worn.some((i) => i.definition?.armorTypeId === 3);
	const unarmored = worn.length === 0;
	for (const m of allMods) {
		if (m.type === "set" && m.subType === "innate-speed-walking") speed = Math.max(speed, m.value ?? 0);
	}
	for (const m of allMods) {
		if (m.type !== "bonus") continue;
		// Restrictions are free text. The only common one on a speed bonus is Fast
		// Movement's "not in heavy armor"; anything else we can't evaluate is skipped.
		const applies = !m.restriction || (/heavy armor/i.test(m.restriction) && !inHeavyArmor);
		if (applies && (m.subType === "speed" || m.subType === "speed-walking")) speed += m.value ?? 0;
		if (m.subType === "unarmored-movement" && unarmored) speed += m.value ?? 0;
	}
	return speed;
}

export function calcInitiative(dexScore: number, allStats: Record<number, number>, allMods: DdbModifier[]): number {
	let init = Math.floor((dexScore - 10) / 2);
	for (const m of allMods) {
		if (m.type !== "bonus" || m.subType !== "initiative") continue;
		init += m.value ?? 0;
		if (m.statId != null) init += Math.floor(((allStats[m.statId] ?? 10) - 10) / 2);
	}
	return init;
}

// ─── Which features to show ───────────────────────────────────────────────────

// D&D Beyond uses "feats" internally to wire up things that aren't feats. These tags
// mark them, and its own sheet leaves them out of the feat list. Every character gets
// e.g. "Dark Bargain" (The Crooked Moon) whenever that book is enabled for them.
const INTERNAL_FEAT_TAGS = ["__DISGUISE_FEAT", "__INITIAL_ASI"];

export function getVisibleFeats(char: DdbCharacter): DdbFeat[] {
	return (char.feats ?? []).filter(
		(f) => !(f.definition?.categories ?? []).some((c) => INTERNAL_FEAT_TAGS.includes(c.tagName ?? ""))
	);
}

// Character-creation bookkeeping: the note and sheet already show these as stats.
const CHARGEN_TRAITS = ["Ability Score Increases", "Creature Type", "Languages", "Size", "Speed"];

export function getVisibleRacialTraits(char: DdbCharacter): DdbRacialTrait[] {
	return (char.race?.racialTraits ?? []).filter(
		(t) => !t.definition?.hideInSheet && !CHARGEN_TRAITS.includes(t.definition?.name ?? "")
	);
}

// classFeatures lists every level of the class, so cap it at the character's level.
// Subclass features can show up in both lists; "Core X Traits" is the class's
// proficiency table, not a feature.
export function getClassFeatures(cls: DdbClass): DdbDefinition[] {
	const level = cls.level ?? 0;
	const seen = new Set<string>();
	const all: DdbDefinition[] = [
		...(cls.classFeatures ?? []).map((f) => f.definition ?? {}),
		...(cls.subclassDefinition?.classFeatures ?? []),
	];
	return all
		.filter((def) => {
			if (!def.name || def.hideInSheet || (def.requiredLevel ?? 0) > level) return false;
			if (/^Core .+ Traits$/.test(def.name) || seen.has(def.name)) return false;
			seen.add(def.name);
			return true;
		})
		.sort((a, b) => (a.requiredLevel ?? 0) - (b.requiredLevel ?? 0));
}

// ─── HP state ─────────────────────────────────────────────────────────────────

// State for a tracker rendered from a note. Local changes survive re-renders, but
// when the note's own values changed since we last read them, the note wins.
export function resolveHPState(raw: string | undefined, maxHp: number, noteCurrent: number, noteTemp: number): HPState {
	const fresh: HPState = { max: maxHp, current: noteCurrent, temp: noteTemp, dsS: 0, dsF: 0, log: [], noteCurrent, noteTemp };
	if (!raw) return fresh;
	let saved: HPState;
	try {
		saved = JSON.parse(raw) as HPState;
	} catch {
		return fresh;
	}
	if (saved.noteCurrent == null) return { ...saved, max: maxHp, noteCurrent, noteTemp };
	if (saved.noteCurrent !== noteCurrent || saved.noteTemp !== noteTemp) {
		return { ...fresh, dsS: saved.dsS, dsF: saved.dsF, log: saved.log ?? [] };
	}
	return { ...saved, max: maxHp };
}

// State right after pulling a character from D&D Beyond: its numbers replace whatever
// the local tracker held, which is what pressing Refresh asks for.
export function syncedHPState(raw: string | undefined, char: DdbCharacter, stats: Record<string, number>, stamp: string): HPState {
	const hp = calcHP(char, stats.con, calcLevel(char.classes ?? []), getAllModifiers(char));
	let log: string[] = [];
	let changed = false;
	try {
		if (raw) {
			const prev = JSON.parse(raw) as HPState;
			log = prev.log ?? [];
			changed = prev.current !== hp.current || prev.temp !== hp.temp;
		}
	} catch { /* unreadable state: start over */ }
	if (changed) log = [`[${stamp}] 🔄 D&D Beyond → ${hp.current} / ${hp.max} HP`, ...log].slice(0, 20);
	return {
		max: hp.max,
		current: hp.current,
		temp: hp.temp,
		dsS: char.deathSaves?.successCount ?? 0,
		dsF: char.deathSaves?.failCount ?? 0,
		log,
		noteCurrent: hp.current,
		noteTemp: hp.temp,
	};
}

export function alignmentName(id: number): string {
	const map: Record<number, string> = {
		1: "Lawful Good", 2: "Neutral Good", 3: "Chaotic Good",
		4: "Lawful Neutral", 5: "True Neutral", 6: "Chaotic Neutral",
		7: "Lawful Evil", 8: "Neutral Evil", 9: "Chaotic Evil",
	};
	return map[id] ?? "Unaligned";
}

export function activationTypeName(id: number): string {
	const map: Record<number, string> = {
		1: "Action", 2: "No Action", 3: "Bonus Action",
		4: "Reaction", 6: "Minute(s)", 7: "Hour(s)",
	};
	return map[id] ?? "Action";
}

export function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<\/li>/gi, "\n")
		.replace(/<li>/gi, "- ")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&quot;/g, '"')
		.trim();
}

export function extractCharacterId(url: string): string | null {
	const match = url.match(/\/characters\/(\d+)/);
	if (match) return match[1];
	if (/^\d+$/.test(url.trim())) return url.trim();
	return null;
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

// Modifiers (feats, race, class, background) can grant flat bonuses to ability scores.
// bonusStats from the API is typically all-null; the real bonuses live in modifiers[*].
// Shared by buildMarkdown() and Plugin.importCharacter() (which needs the raw scores
// again to populate charCache for the Interactive Character Sheet).
export function computeRawStats(char: DdbCharacter): Record<string, number> {
	const statSubTypeToId: Record<string, number> = {
		"strength-score": 1, "dexterity-score": 2, "constitution-score": 3,
		"intelligence-score": 4, "wisdom-score": 5, "charisma-score": 6,
	};
	const allModifiers = getAllModifiers(char);
	const modifierStatBonuses: DdbStat[] = allModifiers
		.filter((m) => m.type === "bonus" && m.subType in statSubTypeToId && m.value != null)
		.map((m) => ({ id: statSubTypeToId[m.subType], value: m.value! }));
	const effectiveBonusStats = [
		...(char.bonusStats ?? []).filter((s) => s.value != null),
		...modifierStatBonuses,
	];
	return {
		str: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 1),
		dex: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 2),
		con: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 3),
		int: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 4),
		wis: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 5),
		cha: getStatValue(char.stats ?? [], char.overrideStats ?? [], effectiveBonusStats, 6),
	};
}

export function buildMarkdown(
	data: DdbApiResponse,
	settings: DnDBeyondImporterSettings
): string {
	const char = data.data;
	if (!char) throw new Error("Unexpected API response structure");

	const classes: DdbClass[] = char.classes ?? [];
	const totalLevel = calcLevel(classes);
	const pb = profBonus(totalLevel);

	const rawStats = computeRawStats(char);
	const allModifiers = getAllModifiers(char);

	const rawStatsById: Record<number, number> = { 1: rawStats.str, 2: rawStats.dex, 3: rawStats.con, 4: rawStats.int, 5: rawStats.wis, 6: rawStats.cha };
	const hp = calcHP(char, rawStats.con, totalLevel, allModifiers);
	const ac = calcAC(char, rawStats.dex, rawStatsById, allModifiers);
	const speed = calcSpeed(char, allModifiers);
	const initiative = calcInitiative(rawStats.dex, rawStatsById, allModifiers);

	const raceName: string = char.race?.fullName ?? char.race?.baseName ?? "Unknown Race";
	const classString = classes
		.map((c) => `${c.definition?.name ?? "Unknown"} ${c.level ?? 0}`)
		.join(" / ");
	const background: string = char.background?.definition?.name ?? "Unknown Background";
	const alignment: string =
		char.alignmentId != null ? alignmentName(char.alignmentId) : "Unaligned";

	const tags = ["dnd-character", raceName.toLowerCase().replace(/\s+/g, "-")];
	classes.forEach((c) => {
		const cname = c.definition?.name;
		if (cname) tags.push(cname.toLowerCase());
	});

	// ── YAML Front Matter ───────────────────────────────────────────────────
	let md = `---
name: ${JSON.stringify(char.name ?? "")}
race: ${JSON.stringify(raceName)}
class: ${JSON.stringify(classString)}
level: ${totalLevel}
background: ${JSON.stringify(background)}
alignment: ${JSON.stringify(alignment)}
xp: ${char.currentXp ?? 0}
hp: ${hp.max}
modifier: ${initiative}
hp_current: ${hp.current}
hp_temp: ${hp.temp}
ac: ${ac}
speed: ${speed}
proficiency_bonus: ${pb}
str: ${rawStats.str}
dex: ${rawStats.dex}
con: ${rawStats.con}
int: ${rawStats.int}
wis: ${rawStats.wis}
cha: ${rawStats.cha}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
dndbeyond_id: ${char.id}
---

`;

	// ── Title ───────────────────────────────────────────────────────────────
	md += `# ${char.name ?? "Unknown Character"}\n\n`;
	if (char.avatarUrl) md += `![${char.name ?? ""}](${char.avatarUrl})\n\n`;
	md += `> **${classString}** • ${raceName} • Level ${totalLevel}\n`;
	md += `> *${background} — ${alignment}*\n\n`;

	// ── Interactive Sheet Button marker (post-processor picks this up) ────────
	md += `\`\`\`dnd-sheet-launcher\ncharId:${char.id}\n\`\`\`\n\n`;

	// ── HP Tracker Widget ───────────────────────────────────────────────────
	md += buildHPTrackerWidget(char.id, hp.max, hp.current, hp.temp);

	// ── Core Stats ──────────────────────────────────────────────────────────
	md += `## Core Stats\n\n`;
	md += `| HP | AC | Speed | Initiative | Proficiency Bonus |\n`;
	md += `|:---:|:---:|:---:|:---:|:---:|\n`;
	md += `| ${hp.current} / ${hp.max}${hp.temp > 0 ? ` (+${hp.temp} temp)` : ""} | ${ac} | ${speed} ft | ${initiative >= 0 ? "+" : ""}${initiative} | +${pb} |\n\n`;

	// ── Ability Scores ──────────────────────────────────────────────────────
	md += `## Ability Scores\n\n`;
	md += `| STR | DEX | CON | INT | WIS | CHA |\n`;
	md += `|:---:|:---:|:---:|:---:|:---:|:---:|\n`;
	md += `| ${rawStats.str} (${modStr(rawStats.str)}) | ${rawStats.dex} (${modStr(rawStats.dex)}) | ${rawStats.con} (${modStr(rawStats.con)}) | ${rawStats.int} (${modStr(rawStats.int)}) | ${rawStats.wis} (${modStr(rawStats.wis)}) | ${rawStats.cha} (${modStr(rawStats.cha)}) |\n\n`;

	// ── Saving Throws ───────────────────────────────────────────────────────
	md += buildSavingThrows(char, rawStats, pb);

	// ── Skills ──────────────────────────────────────────────────────────────
	md += buildSkillsSection(char, rawStats, pb);

	// ── Proficiencies & Languages ───────────────────────────────────────────
	md += buildProficiencies(char);

	// ── Currency ────────────────────────────────────────────────────────────
	const curr = char.currencies;
	if (curr) {
		md += `## Currency\n\n`;
		md += `| CP | SP | EP | GP | PP |\n`;
		md += `|:---:|:---:|:---:|:---:|:---:|\n`;
		md += `| ${curr.cp ?? 0} | ${curr.sp ?? 0} | ${curr.ep ?? 0} | ${curr.gp ?? 0} | ${curr.pp ?? 0} |\n\n`;
	}

	// ── Equipment ───────────────────────────────────────────────────────────
	if (settings.includeEquipment && (char.inventory?.length ?? 0) > 0) {
		md += buildEquipment(char.inventory ?? []);
	}

	// ── Actions & Attacks ───────────────────────────────────────────────────
	const actionList = extractActions(char, rawStats, pb);
	if (actionList.length) {
		md += buildActionsSection(actionList);
	}

	// ── Features & Traits ───────────────────────────────────────────────────
	if (settings.includeFeatures) {
		md += buildFeatures(char);
	}

	// ── Spells ──────────────────────────────────────────────────────────────
	if (settings.includeSpells) {
		const spellSection = buildSpells(char);
		if (spellSection) md += spellSection;
	}

	// ── Backstory & Notes ───────────────────────────────────────────────────
	if (settings.includeBackstory) {
		md += buildBackstory(char);
	}

	// ── Player Notes ────────────────────────────────────────────────────────
	md += `## Session Notes\n\n*Add your notes here.*\n\n`;
	md += `---\n*Imported from [D&D Beyond](https://www.dndbeyond.com/characters/${char.id}) — Level ${totalLevel} ${char.name ?? ""}*\n`;

	return md;
}

// ─── HP Tracker Widget ────────────────────────────────────────────────────────
// Outputs a marker <div> only — the MarkdownPostProcessor in onload() wires it up.

export function buildHPTrackerWidget(charId: number, maxHp: number, currentHp: number, tempHp: number): string {
	return `\`\`\`dnd-hp-tracker\ncharId:${charId}\nmaxHp:${maxHp}\ncurrentHp:${currentHp}\ntempHp:${tempHp}\n\`\`\`\n\n`;
}

// ─── Section builders ─────────────────────────────────────────────────────────

export function buildSavingThrows(
	char: DdbCharacter,
	stats: Record<string, number>,
	pb: number
): string {
	const statKeys = [
		{ key: "str", label: "STR", subType: "strength-saving-throws" },
		{ key: "dex", label: "DEX", subType: "dexterity-saving-throws" },
		{ key: "con", label: "CON", subType: "constitution-saving-throws" },
		{ key: "int", label: "INT", subType: "intelligence-saving-throws" },
		{ key: "wis", label: "WIS", subType: "wisdom-saving-throws" },
		{ key: "cha", label: "CHA", subType: "charisma-saving-throws" },
	];

	const allMods = getAllModifiers(char);
	const cells = statKeys.map(({ key, subType }) => {
		const statVal = stats[key] ?? 10;
		const base = Math.floor((statVal - 10) / 2);
		const isProficient = allMods.some(
			(m) => m.type === "proficiency" && m.subType === subType
		);
		const total = isProficient ? base + pb : base;
		const str = total >= 0 ? `+${total}` : `${total}`;
		const advState = getAdvantageState(allMods, subType, "saving-throws");
		const advMarker = formatAdvMarkerMd(advState);
		return (isProficient ? `**${str}** ✓` : str) + advMarker;
	});

	let md = `## Saving Throws\n\n`;
	md += `| STR | DEX | CON | INT | WIS | CHA |\n`;
	md += `|:---:|:---:|:---:|:---:|:---:|:---:|\n`;
	md += `| ${cells.join(" | ")} |\n\n`;
	return md;
}

export function buildSkillsSection(
	char: DdbCharacter,
	stats: Record<string, number>,
	pb: number
): string {
	const skillDefs = [
		{ name: "Acrobatics", stat: "dex", key: "acrobatics" },
		{ name: "Animal Handling", stat: "wis", key: "animal-handling" },
		{ name: "Arcana", stat: "int", key: "arcana" },
		{ name: "Athletics", stat: "str", key: "athletics" },
		{ name: "Deception", stat: "cha", key: "deception" },
		{ name: "History", stat: "int", key: "history" },
		{ name: "Insight", stat: "wis", key: "insight" },
		{ name: "Intimidation", stat: "cha", key: "intimidation" },
		{ name: "Investigation", stat: "int", key: "investigation" },
		{ name: "Medicine", stat: "wis", key: "medicine" },
		{ name: "Nature", stat: "int", key: "nature" },
		{ name: "Perception", stat: "wis", key: "perception" },
		{ name: "Performance", stat: "cha", key: "performance" },
		{ name: "Persuasion", stat: "cha", key: "persuasion" },
		{ name: "Religion", stat: "int", key: "religion" },
		{ name: "Sleight of Hand", stat: "dex", key: "sleight-of-hand" },
		{ name: "Stealth", stat: "dex", key: "stealth" },
		{ name: "Survival", stat: "wis", key: "survival" },
	];

	const allMods = getAllModifiers(char);

	let md = `## Skills\n\n`;
	md += `| Skill | Stat | Bonus |\n`;
	md += `|:---|:---:|:---:|\n`;

	for (const skill of skillDefs) {
		const statVal = stats[skill.stat] ?? 10;
		const base = Math.floor((statVal - 10) / 2);
		const expertise = allMods.some(
			(m) => m.type === "expertise" && m.subType === skill.key
		);
		const prof = allMods.some(
			(m) => m.type === "proficiency" && m.subType === skill.key
		);
		let bonus = base;
		if (expertise) bonus += pb * 2;
		else if (prof) bonus += pb;

		const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
		const marker = expertise ? " ★" : prof ? " ✓" : "";
		const advState = getAdvantageState(allMods, skill.key, "ability-checks");
		const advMarker = formatAdvMarkerMd(advState);
		md += `| ${skill.name}${marker} | ${skill.stat.toUpperCase()} | ${bonusStr}${advMarker} |\n`;
	}

	md += "\n*✓ = Proficient, ★ = Expertise, ▲A = Advantage, –N = None, ▼D = Disadvantage*\n\n";
	return md;
}

export function buildProficiencies(char: DdbCharacter): string {
	const allMods = getAllModifiers(char);

	const collect = (filterFn: (m: DdbModifier) => boolean): string[] =>
		[
			...new Set(
				allMods
					.filter(filterFn)
					.map((m) => m.friendlySubtypeName ?? m.subType)
					.filter(Boolean)
			),
		] as string[];

	const languages = collect((m) => m.type === "language");
	const armors = collect(
		(m) => m.type === "proficiency" && (m.subType ?? "").includes("armor")
	);
	const weapons = collect(
		(m) => m.type === "proficiency" && (m.subType ?? "").includes("weapon")
	);
	const tools = collect(
		(m) => m.type === "proficiency" && (m.subType ?? "").includes("tool")
	);

	let md = `## Proficiencies & Languages\n\n`;
	if (languages.length) md += `**Languages:** ${languages.join(", ")}\n\n`;
	if (armors.length) md += `**Armor:** ${armors.join(", ")}\n\n`;
	if (weapons.length) md += `**Weapons:** ${weapons.join(", ")}\n\n`;
	if (tools.length) md += `**Tools:** ${tools.join(", ")}\n\n`;

	return md;
}

export function buildEquipment(inventory: DdbInventoryItem[]): string {
	let md = `## Equipment\n\n`;
	md += `| Item | Qty | Equipped | Weight |\n`;
	md += `|:---|:---:|:---:|:---:|\n`;

	for (const item of inventory) {
		const def = item.definition;
		if (!def) continue;
		const name = def.name ?? "Unknown Item";
		const qty = item.quantity ?? 1;
		const equipped = item.equipped ? "✓" : "—";
		const weight =
			def.weight != null ? `${(def.weight * qty).toFixed(1)} lbs` : "—";
		md += `| ${name} | ${qty} | ${equipped} | ${weight} |\n`;
	}

	md += "\n";
	return md;
}

export function buildActionsSection(actions: CharacterAction[]): string {
	let md = `## Actions & Attacks\n\n`;
	md += `| Name | ATK Bonus | Damage | Range | Notes |\n`;
	md += `|:---|:---:|:---|:---:|:---|\n`;
	for (const a of actions) {
		const atkStr = a.attackBonus != null
			? (a.attackBonus >= 0 ? `+${a.attackBonus}` : `${a.attackBonus}`)
			: "—";
		const dmgStr = a.damageDice
			? `${a.damageDice}${a.damageBonus !== 0 ? (a.damageBonus >= 0 ? `+${a.damageBonus}` : `${a.damageBonus}`) : ""}`
			: (a.damageBonus !== 0 ? `${a.damageBonus}` : "—");
		const prefix = a.isSpell ? "✨ " : "⚔️ ";
		md += `| ${prefix}${a.name} | ${atkStr} | ${dmgStr} | ${a.range} | ${a.notes || "—"} |\n`;
	}
	md += "\n";
	return md;
}

export function buildFeatures(char: DdbCharacter): string {
	let md = `## Features & Traits\n\n`;

	for (const cls of char.classes ?? []) {
		const features = getClassFeatures(cls);
		if (!features.length) continue;
		md += `### ${cls.definition?.name ?? "Class"} Features\n\n`;
		for (const def of features) {
			md += `**${def.name ?? ""}**\n`;
			if (def.description) md += `${stripHtml(def.description)}\n`;
			md += "\n";
		}
	}

	const raceTraits = getVisibleRacialTraits(char);
	if (raceTraits.length) {
		md += `### Racial Traits\n\n`;
		for (const trait of raceTraits) {
			const def = trait.definition;
			if (!def) continue;
			md += `**${def.name ?? ""}**\n`;
			if (def.description) md += `${stripHtml(def.description)}\n`;
			md += "\n";
		}
	}

	const feats = getVisibleFeats(char);
	if (feats.length) {
		md += `### Feats\n\n`;
		for (const feat of feats) {
			const def = feat.definition;
			if (!def) continue;
			md += `**${def.name ?? ""}**\n`;
			if (def.description) md += `${stripHtml(def.description)}\n`;
			md += "\n";
		}
	}

	const t = char.traits;
	if (t) {
		md += `### Character Traits\n\n`;
		if (t.personalityTraits) md += `**Personality:** ${t.personalityTraits}\n\n`;
		if (t.ideals) md += `**Ideals:** ${t.ideals}\n\n`;
		if (t.bonds) md += `**Bonds:** ${t.bonds}\n\n`;
		if (t.flaws) md += `**Flaws:** ${t.flaws}\n\n`;
		if (t.appearance) md += `**Appearance:** ${t.appearance}\n\n`;
	}

	return md;
}

export function buildSpells(char: DdbCharacter): string {
	const allSpells: DdbSpell[] = [];

	if (Array.isArray(char.classSpells)) {
		for (const cs of char.classSpells) {
			for (const spell of cs.spells ?? []) allSpells.push(spell);
		}
	}

	for (const src of ["race", "background", "feat", "class", "item"]) {
		for (const spell of char.spells?.[src] ?? []) allSpells.push(spell);
	}

	if (!allSpells.length) return "";

	let md = `## Spells\n\n`;

	const byLevel: Map<number, DdbSpell[]> = new Map();
	for (const spell of allSpells) {
		const lvl = spell.definition?.level ?? 0;
		if (!byLevel.has(lvl)) byLevel.set(lvl, []);
		byLevel.get(lvl)!.push(spell);
	}

	const levelNames = [
		"Cantrips", "1st Level", "2nd Level", "3rd Level",
		"4th Level", "5th Level", "6th Level", "7th Level",
		"8th Level", "9th Level",
	];

	for (const [lvl, spells] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
		md += `### ${levelNames[lvl] ?? `Level ${lvl}`}\n\n`;
		md += `| Spell | School | Cast Time | Range | Conc. | Prepared |\n`;
		md += `|:---|:---|:---|:---|:---:|:---:|\n`;
		for (const spell of spells) {
			const def = spell.definition;
			if (!def) continue;
			const school = def.school ?? "—";
			const castTime =
				def.activation?.activationTime != null
					? `${def.activation.activationTime} ${activationTypeName(def.activation.activationType ?? 1)}`
					: "—";
			const range =
				def.range?.rangeValue != null
					? `${def.range.rangeValue} ft`
					: def.range?.origin ?? "—";
			const conc = def.concentration ? "✓" : "—";
			const prepared = spell.prepared ? "✓" : "—";
			md += `| **${def.name ?? ""}** | ${school} | ${castTime} | ${range} | ${conc} | ${prepared} |\n`;
		}
		md += "\n";
	}

	// Spell slots
	const spellSlots = char.spellSlots;
	if (spellSlots) {
		const slots: DdbSpellSlot[] = Array.isArray(spellSlots)
			? spellSlots
			: Object.values<DdbSpellSlot>(spellSlots);
		const usefulSlots = slots.filter((s) => s.max);
		if (usefulSlots.length) {
			md += `### Spell Slots\n\n`;
			md += `| Level | Used | Max |\n`;
			md += `|:---:|:---:|:---:|\n`;
			for (const slot of usefulSlots) {
				md += `| ${slot.level ?? "?"} | ${slot.used ?? 0} | ${slot.max ?? 0} |\n`;
			}
			md += "\n";
		}
	}

	return md;
}

export function buildBackstory(char: DdbCharacter): string {
	const notes = char.notes;
	if (!notes) return "";

	let md = `## Backstory & Notes\n\n`;
	if (notes.backstory) md += `### Backstory\n\n${stripHtml(notes.backstory)}\n\n`;
	if (notes.personalityTraits)
		md += `**Personality Traits:** ${notes.personalityTraits}\n\n`;
	if (notes.allies) md += `**Allies & Organizations:** ${notes.allies}\n\n`;
	if (notes.enemies) md += `**Enemies:** ${notes.enemies}\n\n`;
	if (notes.otherNotes) md += `**Other Notes:** ${notes.otherNotes}\n\n`;

	return md;
}

// ─── Actions extractor ───────────────────────────────────────────────────────

export function extractActions(char: DdbCharacter, stats: Record<string, number>, pb: number): CharacterAction[] {
	const actions: CharacterAction[] = [];
	const strMod = Math.floor((stats.str - 10) / 2);
	const dexMod = Math.floor((stats.dex - 10) / 2);

	for (const item of char.inventory ?? []) {
		const def = item.definition as (DdbDefinition & {
			weaponBehaviors?: Array<{attackType?: number; damage?: {diceString?: string; fixedValue?: number}; properties?: Array<{name?: string}>}>;
			isMonkWeapon?: boolean;
			weaponTypeRange?: number;
			categoryId?: number;
			damage?: { diceString?: string; fixedValue?: number };
			properties?: Array<{ name?: string }>;
		});
		if (!def || !item.equipped) continue;

		// Accept categoryId 1 (standard weapons) or items that have weaponBehaviors (custom/magic weapons)
		const hasWeaponBehaviors = Array.isArray(def.weaponBehaviors) && def.weaponBehaviors.length > 0;
		if (def.categoryId !== 1 && !hasWeaponBehaviors) continue;

		const isFinesse = def.properties?.some((p) => p.name === "Finesse") ?? false;
		const isRanged = def.weaponTypeRange === 2;
		const atkMod = isRanged ? dexMod : (isFinesse ? Math.max(strMod, dexMod) : strMod);
		const attackBonus = atkMod + pb;

		// Only use damage dice if explicitly defined on the item — homebrew items with no
		// damage field (e.g. utility weapons) are ATK-only and show no DMG roll.
		const dmgDice: string | null = def.damage?.diceString ?? null;
		const fixedVal: number | null = def.damage?.fixedValue ?? null;
		const dmgBonus = dmgDice != null || fixedVal != null ? atkMod + (fixedVal ?? 0) : 0;

		// Build range string — prefer explicit rangeValue, then properties, then defaults
		const rangeVal = def.range?.rangeValue;
		const propNames = (def.properties ?? []).map((p) => p.name ?? "").filter(Boolean);
		const rangeStr = rangeVal
			? `${rangeVal} ft`
			: (isRanged ? "Ranged" : "5 ft");

		actions.push({
			name: def.name ?? "Unknown Weapon",
			attackBonus,
			damageDice: dmgDice,
			damageBonus: dmgBonus,
			range: rangeStr,
			notes: propNames.join(", "),
			isSpell: false,
		});
	}

	// Unarmed strike always present
	const unarmedDmg = 1 + strMod;
	actions.push({
		name: "Unarmed Strike",
		attackBonus: strMod + pb,
		damageDice: null,
		damageBonus: unarmedDmg,
		range: "5 ft",
		notes: "Bludgeoning",
		isSpell: false,
	});

	// Cantrip attack spells
	const allSpells: DdbSpell[] = [];
	if (Array.isArray(char.classSpells)) {
		for (const cs of char.classSpells) for (const sp of cs.spells ?? []) allSpells.push(sp);
	}
	const spellAttackBonus = Math.floor((stats.int - 10) / 2) + pb;
	for (const spell of allSpells) {
		const def = spell.definition;
		if (!def || (def.level ?? 0) !== 0) continue;
		const actType = def.activation?.activationType;
		if (actType !== 1 && actType !== 3) continue; // action or bonus action only
		const rangeVal = def.range?.rangeValue;
		actions.push({
			name: def.name ?? "Cantrip",
			attackBonus: spellAttackBonus,
			damageDice: null,
			damageBonus: 0,
			range: rangeVal ? `${rangeVal} ft` : (def.range?.origin ?? "—"),
			notes: def.school ?? "",
			isSpell: true,
		});
	}

	return actions;
}

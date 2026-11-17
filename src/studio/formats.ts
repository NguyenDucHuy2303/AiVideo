/**
 * The shapes a "Học tiếng Anh cùng Huy" video can take (chosen 2026-11-16: one shape every time
 * bored the children). Each format says what the writer is to write (its beats, its length, what
 * it teaches: words or phrases), how the director draws it, and what the checker asks of it.
 * The four regulars are always there; Emma, the English voice of the cards, reads every word.
 *
 * The studio takes them in turn (nextFormats): a new lesson gets the format least lately used on
 * its line, then the brain finds a theme that suits it. The review page can change it (the
 * script is then written again).
 */

export const FORMAT_IDS = ["cards", "story", "gameshow", "roleplay", "shadow", "oops"] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export interface LessonFormat {
  id: FormatId;
  /** Its name on the review page (Vietnamese). */
  name: string;
  icon: string;
  /** For the proposer: what kind of theme suits it. */
  fits: string;
  /** What it teaches: words ("cat") or phrases ("How much is it?"), how many. */
  teaches: "words" | "phrases";
  items: [number, number];
  /** Every beat, in order (all required). */
  beats: string[];
  /** The beats where Emma must speak in every scene. */
  emma: string[];
  /** The beats as told to the writer. */
  plan: string[];
  scenes: [number, number];
  /** Words in all (Vietnamese syllables and English words count alike). */
  length: [number, number];
  /** Pauses for the viewers ("[3s]") the script must have at least. */
  pauses?: number;
  /** A game with points: scenes say who won one (QAScene.point). */
  scoring?: boolean;
  title: string;
  thumbnail: string;
  shorts: string;
  /** For the director: how its scenes are laid out and drawn. */
  direct: string[];
}

const WORD_CARD = "a word card: the picture (one icon, size 260–340), the English word big under it (font-size 64–80, bold), the Vietnamese meaning smaller under that (font-size 36–44)";

export const FORMATS: Record<FormatId, LessonFormat> = {
  cards: {
    id: "cards", name: "Thẻ từ", icon: "🃏", teaches: "words", items: [8, 10],
    fits: "any theme of 8–10 everyday words that can be drawn (animals, colours, fruit, school things)",
    beats: ["hook", "word", "practice", "sentence", "recap", "next"], emma: ["word"],
    plan: [
      "- hook (1–2 scenes): Huy greets the viewers (\"Chào các bạn!\") and says what we learn today; Bối and Beo are excited.",
      "- word (one scene per word, 8–10 words): Huy says the Vietnamese meaning and a tiny tip; Emma says the word twice (\"Cat. Cat.\"); Bối repeats it (Beo too in some scenes); sometimes Emma reads a two-to-four-word phrase with it (\"A small cat.\").",
      "- practice (3–5 scenes): a quiz: Huy asks in Vietnamese or Emma asks \"What is this?\", a pause for the viewers, Bối or Beo guesses (once wrongly and fixes it), Emma says the answer.",
      "- sentence (2–4 scenes): one or two simple sentences with the words (\"I have a cat.\"), Emma reads, Bối repeats, Huy explains the meaning.",
      "- recap (1–2 scenes): Emma reads all the words once more, Bối repeats the hardest one, Beo his favourite.",
      "- next (1 scene): Huy says the next theme and asks to subscribe to the channel.",
    ],
    scenes: [28, 40], length: [900, 1250], pauses: 2,
    title: "\"Học tiếng Anh: <theme> | <3–4 English words>\"",
    thumbnail: "e.g. \"CAT, DOG, FISH!\"",
    shorts: "3–4 of the word scenes and the end",
    direct: [
      `word: board = ${WORD_CARD}.`,
      "practice: board = the picture, and the English word with class=\"answer\" (it appears only when the viewers' pause is over).",
      "sentence: board = the sentence in English (font-size 48–56) with its icons, the Vietnamese meaning under it.",
      "recap: board = every word's icon with its word, in a grid.",
    ],
  },
  story: {
    id: "story", name: "Truyện có từ mới", icon: "📖", teaches: "words", items: [6, 8],
    fits: "words met on a little outing or in a home task (at the market, in the kitchen, at the beach, on the farm, a picnic, a birthday)",
    beats: ["hook", "story", "word", "recap", "next"], emma: ["word"],
    plan: [
      "- hook (1–2 scenes): Huy greets the viewers (\"Chào các bạn!\") and opens today's little story: where the four are going, and that we will meet some English words on the way.",
      "- story (14–24 scenes): a small adventure of the four in one or two real places (a market, a kitchen, a park, a beach, a farm…): a small problem (Beo has lost his teddy, a cake to bake for Mum, a picnic and then rain), funny moments, a happy end. Told by the characters' lines (no narrator); Huy may link two moments in one sentence. Mostly Vietnamese, the new English words used in it.",
      "- word (one scene per word, 6–8 words, inside the story where each thing appears, never all at the end): the thing appears; Emma says the word twice; Bối, Beo or Hùng repeats it in English, then uses it at once in the story (a short Vietnamese line with the word).",
      "- recap (2–3 scenes): back in the studio: Emma reads all the words again, Bối and Beo repeat; one word is asked (\"Cái này tiếng Anh là gì nhỉ?\"), a pause for the viewers, then Emma answers.",
      "- next (1 scene): Huy says the next story's theme and asks to subscribe to the channel.",
    ],
    scenes: [26, 40], length: [950, 1300], pauses: 1,
    title: "\"Học tiếng Anh qua truyện: <the story in a few words> | <3 English words>\"",
    thumbnail: "e.g. \"BEO LẠC Ở CHỢ!\"",
    shorts: "the funniest 4–5 story and word scenes in a row and the end",
    direct: [
      "story: layout place, the story's place (a market stall, a kitchen, a park…), the same words each time the place comes back.",
      "word: layout tag: the story's place with a small word card in the corner; board = \"english word | nghĩa tiếng Việt | icon name\" (e.g. \"apple | quả táo | red apple\"), nothing else.",
      "recap: board = every word's icon with its English word, in a grid; the asked word with class=\"answer\".",
    ],
  },
  gameshow: {
    id: "gameshow", name: "Đố vui đối kháng", icon: "🏆", teaches: "words", items: [6, 8],
    fits: "a theme of 6–8 words that are easy to show in one picture each (animals, food, toys, vehicles, body parts)",
    beats: ["hook", "rules", "word", "round", "final", "result", "next"], emma: ["word"],
    plan: [
      "- hook (1–2 scenes): Hùng, the game host today, opens the show \"Ai nhanh hơn?\" with energy; Huy is the referee; team Bối against team Beo, both excited.",
      "- rules (1 scene): Hùng says the rules simply: a picture appears, the first to say its English name wins a point; the viewers play too, answering before the clock runs out.",
      "- word (one quick scene per word, 6–8 words): the warm-up: Emma says each word twice, both teams repeat, Huy gives the meaning in a few words.",
      "- round (8–12 scenes, one question each): Hùng asks (\"Đây là gì?\") or Emma asks (\"What is this?\"); then a pause for the viewers; then one team answers in English; Emma says the answer; point = the team that won it (\"Bối\" or \"Beo\", \"\" for none). Beo wins about as many as Bối; once Beo answers in a funny wrong way and Bối wins the point; once they answer together.",
      "- final (1–2 scenes): the golden question, a whole short sentence with the words (Emma reads it, a pause, both teams say it back): point = \"both\".",
      "- result (1–2 scenes): Huy reads the score (close, or a tie), praises both teams, everyone cheers; Emma reads all the words once more.",
      "- next (1 scene): Huy says the next game's theme and asks to subscribe to the channel.",
    ],
    scenes: [24, 38], length: [850, 1200], pauses: 7, scoring: true,
    title: "\"Đố vui tiếng Anh: Bối hay Beo nhanh hơn? | <theme>\"",
    thumbnail: "e.g. \"AI NHANH HƠN?\"",
    shorts: "4–5 round scenes in a row and the end",
    direct: [
      `word: board = ${WORD_CARD}.`,
      "round: board = one big picture of the thing (an icon of size 320–400 in the middle) and its English word under it with class=\"answer\" (shown only when the viewers' pause is over). The studio adds the scoreboard and the clock: never draw them.",
      "final: board = the sentence's icons, the sentence in English with class=\"answer\".",
      "result: board = every word's icon with its word, in a grid.",
    ],
  },
  roleplay: {
    id: "roleplay", name: "Nhập vai tình huống", icon: "🎭", teaches: "phrases", items: [5, 7],
    fits: "an everyday situation with 5–7 short phrases a child can say (buying fruit, the first day at school, meeting a new friend, at a birthday, asking the way, at the doctor's)",
    beats: ["hook", "situation", "phrase", "act", "turn", "recap", "next"], emma: ["phrase"],
    plan: [
      "- hook (1 scene): Huy greets the viewers (\"Chào các bạn!\") and says the situation of today (if the theme is a list of words, set a situation around it).",
      "- situation (1–2 scenes): where we are and who plays whom (Bối is the shopper, Hùng the seller, Beo helps…).",
      "- phrase (one scene per phrase, 5–7 phrases of 2–6 words): Emma reads the phrase slowly; Huy says what it means and when to say it; Bối repeats it in English (Beo tries too, now and then a funny slip he fixes).",
      "- act (6–10 scenes): the situation played: the characters say ONLY short English lines (the phrases and simple answers); Huy now and then adds one Vietnamese line to explain what just happened.",
      "- turn (2–3 scenes): the viewers' turn: Huy says in Vietnamese what to say, a pause for the viewers to say it in English, then Emma says it.",
      "- recap (1–2 scenes): Emma reads all the phrases once more, Bối and Beo repeat their favourite.",
      "- next (1 scene): Huy says the next situation and asks to subscribe to the channel.",
    ],
    scenes: [22, 36], length: [600, 950], pauses: 2,
    title: "\"Tiếng Anh giao tiếp cho bé: <the situation> | <one phrase>\"",
    thumbnail: "e.g. \"HOW MUCH IS IT?\"",
    shorts: "the act scenes (4–6 in a row) and the end",
    direct: [
      "phrase: board = a picture of the situation (one or two icons) and the phrase in English (font-size 56–68), the Vietnamese meaning under it.",
      "act: layout tag at the situation's place (a fruit stall at a market, a classroom, a playground…), the same words each time; board = \"english phrase | nghĩa tiếng Việt | icon name\" for the phrase said in that scene.",
      "turn: board = the Vietnamese meaning, and the English phrase under it with class=\"answer\".",
      "recap: board = every phrase in English, one under another, with a small icon each.",
    ],
  },
  shadow: {
    id: "shadow", name: "Đoán bóng", icon: "👤", teaches: "words", items: [8, 10],
    fits: "8–10 things with a shape easy to recognise from their shadow (animals, fruit, vehicles, tools, instruments)",
    beats: ["hook", "shadow", "reveal", "recap", "next"], emma: ["reveal"],
    plan: [
      "- hook (1–2 scenes): Huy greets the viewers (\"Chào các bạn!\") and opens today's game, \"Đoán bóng\": a black shadow appears, guess what it is, then say it in English.",
      "- shadow (one scene per thing, 8–10): the shadow; Huy or Hùng gives one hint in Vietnamese, Beo makes a funny guess, Bối another; the scene ends with a pause for the viewers.",
      "- reveal (one scene right after each shadow scene): the answer: Emma says the word twice; Bối repeats it (Beo sometimes); Huy says the meaning and one tiny fun fact.",
      "- recap (1–2 scenes): all the things once more, quickly: Emma reads each word, Bối and Beo repeat.",
      "- next (1 scene): Huy says the next theme and asks to subscribe to the channel.",
    ],
    scenes: [20, 26], length: [800, 1150], pauses: 8,
    title: "\"Đoán bóng học tiếng Anh: <theme> | <3 English words>\"",
    thumbnail: "e.g. \"ĐÂY LÀ CON GÌ?\"",
    shorts: "3 shadow and reveal pairs and the end",
    direct: [
      "shadow: board = the thing as one big icon in the middle (size 320–400) with class=\"shadow\" (the studio shows it as a black shadow until the viewers' pause is over, then in colour), and its English word under it with class=\"answer\"; nothing else.",
      `reveal: board = ${WORD_CARD}.`,
      "recap: board = every thing's icon with its English word, in a grid.",
    ],
  },
  oops: {
    id: "oops", name: "Beo nói sai, bạn sửa giúp", icon: "🙊", teaches: "words", items: [8, 10],
    fits: "8–10 everyday words a child mixes up easily (animals, colours, clothes, food, family)",
    beats: ["hook", "oops", "win", "recap", "next"], emma: ["oops"],
    plan: [
      "- hook (1–2 scenes): Beo proudly says he knows ALL the English words about the theme; Huy smiles: \"Thật không? Các bạn giúp anh kiểm tra nhé!\".",
      "- oops (one scene per word, 8–10): a picture; Beo says a wrong English word with full confidence (another real word: \"Dog!\" for a cat, or a funny wrong sound); Huy asks the viewers (\"Beo nói đúng không các bạn?\"), then a pause for the viewers to shout the right word; Bối laughs kindly and says it; Emma says the right word twice; Beo repeats it right; Huy gives the meaning. Kind, never mocking: Beo laughs at himself.",
      "- win (2–3 scenes): Beo tries again without help and gets several right; everyone cheers, Beo is proud.",
      "- recap (1–2 scenes): Emma reads all the words once more, Bối and Beo repeat.",
      "- next (1 scene): Huy says the next theme and asks to subscribe to the channel.",
    ],
    scenes: [14, 24], length: [550, 900], pauses: 7,
    title: "\"Beo nói sai rồi! Học tiếng Anh: <theme> | <3 English words>\"",
    thumbnail: "e.g. \"BEO NÓI SAI RỒI!\"",
    shorts: "3–4 oops scenes and the end",
    direct: [
      "oops: board = the picture (one big icon, size 300–360) and, under it, the right English word big with class=\"answer\" and its Vietnamese meaning smaller, also class=\"answer\" (both shown only when the viewers' pause is over).",
      "win: board = the pictures Beo gets right, with their words.",
      "recap: board = every word's icon with its English word, in a grid.",
    ],
  },
};

export const formatOf = (id?: string): LessonFormat => FORMATS[(FORMAT_IDS as readonly string[]).includes(id ?? "") ? (id as FormatId) : "cards"];
export const isFormat = (id: unknown): id is FormatId => typeof id === "string" && (FORMAT_IDS as readonly string[]).includes(id);

/**
 * The formats of the next `count` lessons of a line: never the one just made, the least lately
 * used first (a format never used before goes first of all), in the line's order otherwise.
 * `recent`: the line's lessons, oldest first (a lesson from before formats is "cards").
 */
export function nextFormats(count: number, recent: (string | undefined)[], allowed: readonly string[] = FORMAT_IDS): FormatId[] {
  const pool = allowed.filter(isFormat);
  if (!pool.length) return Array(count).fill("cards");
  const used = recent.map((f) => (isFormat(f) ? f : "cards"));
  const out: FormatId[] = [];
  for (let k = 0; k < count; k++) {
    const seq = [...used, ...out];
    const last = (f: FormatId) => seq.lastIndexOf(f);
    const pick = [...pool].sort((a, b) => last(a) - last(b) || pool.indexOf(a) - pool.indexOf(b))[0]!;
    out.push(pick);
  }
  return out;
}

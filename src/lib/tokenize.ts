/** Tokenization + timing model for the RSVP engine. */

export interface Token {
  text: string
  /** index of the Optimal Recognition Point character */
  orp: number
  /** relative duration multiplier at adaptivity=1 (1 = one base frame) */
  weight: number
  /** true if this token ends a sentence */
  sentenceEnd: boolean
  /** true if this token ends a paragraph */
  paragraphEnd: boolean
  /** char offset of the start of the sentence this token belongs to */
  sentenceStart: number
  /** index of paragraph this token belongs to */
  paragraph: number
}

const COMMON = new Set(
  ('the of and a to in is it you that he was for on are as with his they at be this from I have or by one had not but what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see no way could my than first been call who its now find long down day did get come made may part'.split(' ')),
)

function orpIndex(len: number): number {
  if (len <= 1) return 0
  if (len <= 5) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return 4
}

/** Compute the pacing weight for a word. 1.0 = base duration. */
function weightFor(word: string, sentenceEnd: boolean, clauseEnd: boolean, paragraphEnd: boolean): number {
  const bare = word.replace(/[^\p{L}\p{N}'-]/gu, '')
  let w = 1.0
  const len = bare.length
  if (len >= 8) w += Math.min(0.5, (len - 7) * 0.09) // long words linger
  if (/\d/.test(bare)) w += 0.45 // numbers need a beat
  if (len > 0 && !/^[\p{L}\d'-]+$/u.test(bare)) w += 0.2
  if (COMMON.has(bare.toLowerCase()) && !sentenceEnd && !clauseEnd) w -= 0.22 // glide through connectives
  if (clauseEnd) w += 0.55 // comma, colon, semicolon, dash
  if (sentenceEnd) w += 1.15 // full stop breath
  if (paragraphEnd) w += 0.9 // extra beat at paragraph break
  return Math.max(0.55, w)
}

export function tokenize(content: string): Token[] {
  const tokens: Token[] = []
  const paragraphs = content
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  paragraphs.forEach((para, pIdx) => {
    const words = para.split(' ').filter(Boolean)
    let sentenceStart = 0
    let charPos = 0
    words.forEach((word, i) => {
      const sentenceEnd = /[.!?…]["')\]]?$/.test(word) && !/^\d+\.$/.test(word) && !isAbbreviation(word)
      const clauseEnd = /[,;:—–]["')\]]?$/.test(word)
      const paragraphEnd = i === words.length - 1
      const bare = word.replace(/^[^\p{L}\p{N}]+/u, '')
      const lead = word.length - bare.length
      tokens.push({
        text: word,
        orp: Math.min(word.length - 1, lead + orpIndex(bare.replace(/[^\p{L}\p{N}'-]/gu, '').length)),
        weight: weightFor(word, sentenceEnd, clauseEnd, paragraphEnd && pIdx < paragraphs.length - 1),
        sentenceEnd: sentenceEnd || paragraphEnd,
        paragraphEnd,
        sentenceStart,
        paragraph: pIdx,
      })
      charPos += word.length + 1
      if (sentenceEnd) sentenceStart = charPos
    })
  })
  return tokens
}

const ABBREV = new Set(['mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'vs.', 'etc.', 'e.g.', 'i.e.', 'fig.', 'no.', 'al.'])
function isAbbreviation(word: string): boolean {
  return ABBREV.has(word.toLowerCase()) || /^\p{Lu}\.$/u.test(word)
}

export interface Chunk {
  tokens: Token[]
  text: string
  orp: number // char index of ORP within joined text
  weight: number
  sentenceEnd: boolean
  paragraph: number
  startIndex: number // word index of first token
}

/** Group tokens into display chunks of up to `size` words (respecting clause boundaries). */
export function chunk(tokens: Token[], size: number): Chunk[] {
  if (size <= 1) {
    return tokens.map((t, i) => ({
      tokens: [t],
      text: t.text,
      orp: t.orp,
      weight: t.weight,
      sentenceEnd: t.sentenceEnd,
      paragraph: t.paragraph,
      startIndex: i,
    }))
  }
  const chunks: Chunk[] = []
  let i = 0
  while (i < tokens.length) {
    const group: Token[] = [tokens[i]]
    let j = i
    while (
      group.length < size &&
      j + 1 < tokens.length &&
      !tokens[j].sentenceEnd &&
      !/[,;:—–]$/.test(tokens[j].text) &&
      tokens[j + 1].paragraph === tokens[i].paragraph &&
      group.reduce((n, t) => n + t.text.length, 0) + tokens[j + 1].text.length <= 18
    ) {
      j++
      group.push(tokens[j])
    }
    const text = group.map((t) => t.text).join(' ')
    const center = group[Math.floor((group.length - 1) / 2)]
    let orpOffset = 0
    for (let k = 0; k < group.indexOf(center); k++) orpOffset += group[k].text.length + 1
    chunks.push({
      tokens: group,
      text,
      orp: orpOffset + center.orp,
      weight: group.reduce((n, t) => n + t.weight, 0) * (0.62 + 0.1 * group.length),
      sentenceEnd: group[group.length - 1].sentenceEnd,
      paragraph: group[0].paragraph,
      startIndex: i,
    })
    i = j + 1
  }
  return chunks
}

export function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length
}

/** Duration in ms for a chunk given wpm and adaptivity (0..1). */
export function durationFor(weight: number, nWords: number, wpm: number, adaptivity: number): number {
  const base = 60000 / wpm
  const adapted = 1 + (weight / Math.max(1, nWords) - 1) * adaptivity
  return base * Math.max(1, nWords) * Math.max(0.4, adapted)
}

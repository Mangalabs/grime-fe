import type { HunkPart } from '../../features/suggestions/hunks'

/** A hunk's text, with what is removed struck and what is added marked. */
export function HunkText({ parts }: { parts: HunkPart[] }) {
  if (parts.length === 0) return <span className="suggestion-empty">(nada)</span>
  return (
    <>
      {parts.map((part, index) =>
        part.change === 'removed' ? (
          <del key={index}>{part.text}</del>
        ) : part.change === 'added' ? (
          <ins key={index}>{part.text}</ins>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

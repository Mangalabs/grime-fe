import type { ReactNode } from 'react'
import '../LineBreakRepairModal.css'

// The parts of a dialog that reviews a batch of changes across the book
// (joining line breaks, copyediting): a list of groups the reviewer opens and
// ticks, and progress. Reading the scenes and the ticks are in
// useBatchReview. What is found, how it is grouped and what applying does
// stay with each dialog.

export function ReviewProgress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="linebreak-progress" role="status">
      <span>
        {label} · {done} de {total}
      </span>
      <div aria-hidden="true">
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  )
}

/** How much is ticked, with ticking or unticking everything. */
export function ReviewSummary({ children, onAll, onNone }: { children: ReactNode; onAll: () => void; onNone: () => void }) {
  return (
    <div className="linebreak-summary">
      <strong>{children}</strong>
      <span>
        <button className="text-button" type="button" onClick={onAll}>
          Marcar todas
        </button>
        <button className="text-button" type="button" onClick={onNone}>
          Desmarcar todas
        </button>
      </span>
    </div>
  )
}

interface ReviewGroupProps {
  checkLabel: string
  // Items ticked, of all in the group.
  on: number
  total: number
  isOpen: boolean
  onOpen: () => void
  onCheck: (checked: boolean) => void
  kicker: ReactNode
  title: ReactNode
  children: ReactNode
}

/** One group: a checkbox for all its items (mixed when some), and its list when open. */
export function ReviewGroup({ checkLabel, on, total, isOpen, onOpen, onCheck, kicker, title, children }: ReviewGroupProps) {
  return (
    <li>
      <div className="linebreak-scene-head">
        <input
          aria-label={checkLabel}
          checked={on > 0}
          ref={(input) => {
            if (input) input.indeterminate = on > 0 && on < total
          }}
          type="checkbox"
          onChange={(event) => onCheck(event.target.checked)}
        />
        <button aria-expanded={isOpen} type="button" onClick={onOpen}>
          <span className="linebreak-scene-number">{kicker}</span>
          <span className="linebreak-scene-title">{title}</span>
          <span className="linebreak-count">{on === total ? total : `${on} de ${total}`}</span>
        </button>
      </div>
      {isOpen && children}
    </li>
  )
}

/** One item of an open group. */
export function ReviewItem({ isOn, onCheck, children }: { isOn: boolean; onCheck: (checked: boolean) => void; children: ReactNode }) {
  return (
    <li className={isOn ? undefined : 'is-off'}>
      <label>
        <input checked={isOn} type="checkbox" onChange={(event) => onCheck(event.target.checked)} />
        <span>{children}</span>
      </label>
    </li>
  )
}

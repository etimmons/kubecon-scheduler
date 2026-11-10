import { toggle } from "../state/store.ts";

export function StarButton({ id, starred, title }: { id: string; starred: boolean; title: string }) {
  return (
    <button
      type="button"
      class={`star${starred ? " on" : ""}`}
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${title}` : `Star ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
      </svg>
    </button>
  );
}

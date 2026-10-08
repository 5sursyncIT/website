"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useRef } from "react";
const links = [
  ["/crm", "Tableau de bord"],
  ["/crm/clients", "Entreprises"],
  ["/crm/opportunites", "Opportunités"],
  ["/crm/documents", "Devis et factures"],
  ["/crm/contacts", "Contacts"],
  ["/crm/taches", "Tâches et activités"],
  ["/crm/demandes", "Demandes du site"],
  ["/crm/messagerie", "Messagerie contact@"],
] as const;
export function CRMNav() {
  const path = usePathname();
  return (
    <nav className="crm-nav" aria-label="CRM">
      {links.map(([href, label]) => {
        const current = href === "/crm" ? path === "/crm" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
export function Submit({ children, className = "crm-btn", confirm }: { children: React.ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
export function PrintButton() {
  return (
    <button type="button" className="crm-btn" onClick={() => window.print()}>
      Imprimer ou enregistrer en PDF
    </button>
  );
}

// Moving a deal card: native drag with the mouse, the card's handle with touch, pen
// or mouse (pointer events), and the handle from the keyboard (Enter to pick up,
// arrows to choose, Enter to drop, Escape to cancel). Every path sets the card's
// own stage select and submits its form: the same server action as the OK button.
const STAGES: [string, string][] = [
  ["lead", "Piste"], ["qualified", "Qualifiée"], ["proposal", "Proposition envoyée"],
  ["negotiation", "Négociation"], ["won", "Gagnée"], ["lost", "Perdue"],
];
export function DragBoard({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLParagraphElement>(null);
  const picked = useRef<{ card: HTMLElement; index: number } | null>(null);
  const say = (text: string) => { if (live.current) live.current.textContent = text; };
  const zoneAt = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-stage]") : null);
  const zoneFor = (stage: string) => root.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`) ?? null;
  const mark = (el: HTMLElement | null) =>
    root.current?.querySelectorAll<HTMLElement>("[data-stage]").forEach((z) => z.classList.toggle("is-over", z === el));
  const drop = (card: HTMLElement | null, stage: string | undefined) => {
    mark(null);
    const form = card?.querySelector<HTMLFormElement>("form");
    const select = form?.querySelector<HTMLSelectElement>("select[name=stage]");
    if (!card || !form || !select || !stage || select.value === stage) return false;
    if (stage === "lost" && !window.confirm("Marquer cette opportunité comme perdue ?")) return false;
    select.value = stage;
    card.classList.add("is-moving");
    form.requestSubmit();
    return true;
  };
  const cardOf = (id: string) => (/^\d+$/.test(id) ? root.current?.querySelector<HTMLElement>(`[data-deal="${id}"]`) ?? null : null);
  const stageOf = (card: HTMLElement) => card.querySelector<HTMLSelectElement>("select[name=stage]")?.value ?? "lead";
  // Touch, pen or mouse on the handle: a floating copy follows the pointer.
  const onPointerDown = (e: React.PointerEvent) => {
    const handle = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-handle]") : null;
    const card = handle?.closest<HTMLElement>("[data-deal]");
    if (!handle || !card || e.button > 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const box = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add("crm-deal--ghost");
    Object.assign(ghost.style, { width: `${box.width}px`, left: `${box.left}px`, top: `${box.top}px` });
    document.body.appendChild(ghost);
    card.classList.add("is-dragging");
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const board = root.current?.querySelector<HTMLElement>(".crm-board");
    let over: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      ghost.style.left = `${ev.clientX - dx}px`;
      ghost.style.top = `${ev.clientY - dy}px`;
      over = zoneAt(document.elementFromPoint(ev.clientX, ev.clientY));
      mark(over);
      // Near the screen edges, scroll the board (phones show one column at a time).
      if (board && ev.clientX > window.innerWidth - 40) board.scrollLeft += 14;
      if (board && ev.clientX < 40) board.scrollLeft -= 14;
    };
    const end = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      ghost.remove();
      card.classList.remove("is-dragging");
      if (ev.type === "pointerup") drop(card, over?.dataset.stage);
      mark(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const handle = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-handle]") : null;
    const card = handle?.closest<HTMLElement>("[data-deal]");
    if (!handle || !card) return;
    const p = picked.current;
    if (!p && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const index = Math.max(0, STAGES.findIndex(([v]) => v === stageOf(card)));
      picked.current = { card, index };
      card.classList.add("is-dragging");
      mark(zoneFor(STAGES[index][0]));
      say(`Opportunité saisie, colonne ${STAGES[index][1]}. Flèches pour choisir la colonne, Entrée pour déposer, Échap pour annuler.`);
      return;
    }
    if (!p || p.card !== card) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      p.index = (p.index + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : STAGES.length - 1)) % STAGES.length;
      mark(zoneFor(STAGES[p.index][0]));
      say(STAGES[p.index][1]);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      picked.current = null;
      card.classList.remove("is-dragging");
      const moved = e.key !== "Escape" && drop(card, STAGES[p.index][0]);
      if (!moved) mark(null);
      say(moved ? `Déplacée vers ${STAGES[p.index][1]}.` : "Déplacement annulé.");
    }
  };
  return (
    <div
      ref={root}
      className="crm-dnd"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDragStart={(e) => {
        // The handle has its own pointer drag: no native drag from it.
        if (e.target instanceof Element && e.target.closest("[data-handle]")) return e.preventDefault();
        const card = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-deal]") : null;
        if (!card) return;
        e.dataTransfer.setData("text/plain", card.dataset.deal!);
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("is-dragging");
      }}
      onDragEnd={(e) => {
        if (e.target instanceof Element) e.target.closest("[data-deal]")?.classList.remove("is-dragging");
        mark(null);
      }}
      onDragOver={(e) => {
        const z = zoneAt(e.target);
        if (!z) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        mark(z);
      }}
      onDrop={(e) => {
        const z = zoneAt(e.target);
        if (!z) return mark(null);
        e.preventDefault();
        drop(cardOf(e.dataTransfer.getData("text/plain")), z.dataset.stage);
      }}
    >
      <p ref={live} className="crm-sr" aria-live="assertive" />
      {children}
    </div>
  );
}

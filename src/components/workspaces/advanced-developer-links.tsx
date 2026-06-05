"use client";

import { useState } from "react";

export interface AdvancedDeveloperLink {
  href: string;
  label: string;
  description?: string;
}

export function AdvancedDeveloperLinks({ links }: { links: AdvancedDeveloperLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-foreground"
      >
        <span>Advanced / Developer</span>
        <span className="text-xs font-medium text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-4 grid gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground hover:bg-card"
            >
              <span className="font-medium">{link.label}</span>
              {link.description ? <span className="mt-1 block text-muted-foreground">{link.description}</span> : null}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

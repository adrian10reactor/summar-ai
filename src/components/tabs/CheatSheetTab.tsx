"use client";

import { Subject } from "@/types";
import { saveCheatSheet } from "@/lib/storage";
import HtmlContentTab from "./HtmlContentTab";
import { ImageLookup } from "@/lib/render";

export default function CheatSheetTab(props: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  imageLookup: ImageLookup;
}) {
  return (
    <HtmlContentTab
      {...props}
      contentKey="cheatSheet"
      title="Cheat Sheet"
      emptyIcon="⚡"
      emptyText="Generate a compact cheat sheet with essential formulas, definitions, and key facts."
      apiMode="cheat-sheet"
      onSave={saveCheatSheet}
    />
  );
}

"use client";

import { Subject } from "@/types";
import { saveExamPrep } from "@/lib/storage";
import HtmlContentTab from "./HtmlContentTab";

export default function ExamPrepTab(props: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
}) {
  return (
    <HtmlContentTab
      {...props}
      contentKey="examPrep"
      title="Exam Prep"
      emptyIcon="🎓"
      emptyText="Generate exam preparation materials — solved practice problems, likely questions, and common traps."
      apiMode="exam-prep"
      onSave={saveExamPrep}
    />
  );
}

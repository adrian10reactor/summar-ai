"use client";

import { Subject } from "@/types";
import { saveExamSolutions } from "@/lib/storage";
import HtmlContentTab from "./HtmlContentTab";
import { ImageLookup } from "@/lib/render";

export default function ExamSolutionsTab(props: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  imageLookup: ImageLookup;
  onCrossRefClick?: (target: { subjectId: string; section?: string }) => void;
}) {
  return (
    <HtmlContentTab
      {...props}
      contentKey="examSolutions"
      title="Exam Solutions"
      emptyIcon="✍️"
      emptyText="Solve every problem in your uploaded exams / task sheets, step by step with sketches and citations."
      apiMode="exam-solve"
      onSave={saveExamSolutions}
    />
  );
}

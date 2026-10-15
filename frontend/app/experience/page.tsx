import type { Metadata } from "next";
import { ExperiencePreview } from "./experience-preview";

export const metadata: Metadata = {
  title: "产品体验｜此刻路线",
  description: "了解此刻路线如何把零散目的地整理成今天真正走得完的城市路线。",
};

export default function ExperiencePage() {
  return <ExperiencePreview />;
}

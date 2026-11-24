import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KnowledgeArticle } from "@/lib/knowledge";

/**
 * One article as a card.
 *
 * The library was a run of text rows. Everything those rows carried has to
 * survive the move to a grid - a card that quietly drops the Critical flag
 * is worse than the list it replaced.
 */

const signed = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: (p: string) => signed(p) }) } },
}));

import { ArticleCard } from "@/components/knowledge/ArticleCard";

const article = (over: Partial<KnowledgeArticle> = {}): KnowledgeArticle => ({
  id: "a1", service_id: "s1", category_id: "c1",
  title: "Q-Switch Laser Protocol", summary: "Settings, intervals and aftercare.",
  gender: "both", age_rule: "all_ages", min_age: null, max_age: null,
  is_critical: false, clinical_protocol: Array.from({ length: 600 }, () => "word").join(" "),
  contraindications: "", pre_post_care: "", complications_management: "", sources: "",
  status: "published", is_active: true, reviewed_by: null, reviewed_at: null,
  ai_generated: false, ai_change_summary: "", revision: 1,
  created_by: null, updated_by: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
  resources: null, deleted_at: null, created_by_name: null, updated_by_name: null,
  patient_summary: "", patient_facts: {}, cover_image_path: null, ...over,
}) as KnowledgeArticle;

const noop = () => {};
function card(over: Partial<KnowledgeArticle> = {}, props: Partial<Parameters<typeof ArticleCard>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ArticleCard
        article={article(over)}
        serviceName="Laser Toning"
        categoryName="Pre / post care"
        canEdit={false}
        onOpen={noop} onEdit={noop} onClone={noop} onDelete={noop}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => signed.mockClear());

describe("what the card says", () => {
  it("leads with the title, the service and the category", () => {
    card();
    expect(screen.getByText("Q-Switch Laser Protocol")).toBeInTheDocument();
    expect(screen.getByText("Laser Toning")).toBeInTheDocument();
    expect(screen.getByText("Pre / post care")).toBeInTheDocument();
  });

  it("prints how long it takes to read", () => {
    card();
    expect(screen.getByText("3 min read")).toBeInTheDocument();
  });

  it("prints who it is for", () => {
    card({ age_rule: "custom_range", min_age: 18, max_age: 65, gender: "female" });
    expect(screen.getByText("18–65 years · female")).toBeInTheDocument();
  });

  it("keeps the critical flag the old row had", () => {
    card({ is_critical: true });
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("does not cry wolf on an ordinary article", () => {
    card();
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
  });

  it("keeps the status, inactive, AI and patient-summary marks", () => {
    card({ status: "draft", is_active: false, ai_generated: true, patient_summary: "Plain words for the patient." });
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
    expect(screen.getByText("Patient summary")).toBeInTheDocument();
  });
});

describe("the picture", () => {
  it("signs the chosen cover rather than linking at the bucket", async () => {
    card({ cover_image_path: "u1/g1/cover.jpg" });
    const img = await screen.findByRole("presentation");
    expect(img).toHaveAttribute("src", "https://signed/u1/g1/cover.jpg");
    expect(signed).toHaveBeenCalledWith("u1/g1/cover.jpg");
  });

  it("does not drag in a diagram attached to the article", async () => {
    // It used to, and the clinic saw skin cross-sections cropped into the
    // card headers. An attachment is a figure inside the article, not a
    // cover for it.
    card({ resources: [{ id: "r1", kind: "image", title: "Cross-section", path: "u1/g1/diagram.png" }] as never });
    expect(await screen.findByText("Q-Switch Laser Protocol")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(signed).not.toHaveBeenCalled();
  });

  it("draws its own banner when there is neither, and asks for no URL", () => {
    card();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(signed).not.toHaveBeenCalled();
  });
});

describe("the actions", () => {
  it("offers none to somebody who cannot edit", () => {
    card();
    expect(screen.queryByLabelText(/^Edit /)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Delete /)).not.toBeInTheDocument();
  });

  it("offers edit, clone and delete to somebody who can", () => {
    const onEdit = vi.fn(); const onClone = vi.fn(); const onDelete = vi.fn();
    card({}, { canEdit: true, onEdit, onClone, onDelete });
    fireEvent.click(screen.getByLabelText("Edit Q-Switch Laser Protocol"));
    fireEvent.click(screen.getByLabelText("Clone Q-Switch Laser Protocol"));
    fireEvent.click(screen.getByLabelText("Delete Q-Switch Laser Protocol"));
    expect(onEdit).toHaveBeenCalled();
    expect(onClone).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it("opens the article from the title", () => {
    const onOpen = vi.fn();
    card({}, { onOpen });
    fireEvent.click(screen.getByRole("button", { name: "Q-Switch Laser Protocol" }));
    expect(onOpen).toHaveBeenCalled();
  });
});

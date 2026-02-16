"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TRIAGE_CONTROL_IDS, type MutateTarget, type PendingReviewMode, type ReviewEvent } from "./contracts";
import type { MutationFormState } from "@/hooks/use-pr-mutations";

interface DetailActionsProps {
  writing: boolean;
  form: MutationFormState;
  setFormField: <K extends keyof MutationFormState>(key: K, value: MutationFormState[K]) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitQuickReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitPendingReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitProperties: (event: FormEvent<HTMLFormElement>) => void;
  onMutateStringItem: (target: MutateTarget, value: string, method: "POST" | "DELETE") => void;
}

export function DetailActions({
  writing,
  form,
  setFormField,
  onSubmitComment,
  onSubmitQuickReview,
  onSubmitPendingReview,
  onSubmitProperties,
  onMutateStringItem,
}: DetailActionsProps) {
  return (
    <div className="border-t border-border pt-4">
      <Tabs defaultValue="comment" className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="comment" className="text-xs">Comment</TabsTrigger>
          <TabsTrigger value="review" className="text-xs">Review</TabsTrigger>
          <TabsTrigger value="manage" className="text-xs">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="comment" className="mt-3">
          <form onSubmit={onSubmitComment} className="space-y-2">
            <Textarea
              id={TRIAGE_CONTROL_IDS.commentBody}
              data-control-id={TRIAGE_CONTROL_IDS.commentBody}
              data-shortcut-target={TRIAGE_CONTROL_IDS.commentBody}
              value={form.commentBody}
              onChange={(e) => setFormField("commentBody", e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              className="min-h-[72px] resize-none text-sm"
            />
            <div className="flex justify-end">
              <Button
                id={TRIAGE_CONTROL_IDS.commentSubmit}
                type="submit"
                size="sm"
                disabled={writing || !form.commentBody.trim()}
              >
                Comment
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="review" className="mt-3">
          <form onSubmit={onSubmitQuickReview} className="space-y-2">
            <div className="flex gap-2">
              <Select
                id={TRIAGE_CONTROL_IDS.reviewEvent}
                value={form.reviewEvent}
                onChange={(e) => setFormField("reviewEvent", e.target.value as ReviewEvent)}
                className="h-9 text-xs flex-1"
              >
                <option value="COMMENT">Comment</option>
                <option value="APPROVE">Approve</option>
                <option value="REQUEST_CHANGES">Request changes</option>
              </Select>
            </div>
            <Textarea
              id={TRIAGE_CONTROL_IDS.reviewBody}
              data-control-id={TRIAGE_CONTROL_IDS.reviewBody}
              data-shortcut-target={TRIAGE_CONTROL_IDS.reviewBody}
              value={form.reviewBody}
              onChange={(e) => setFormField("reviewBody", e.target.value)}
              placeholder="Optional review body..."
              rows={3}
              className="min-h-[72px] resize-none text-sm"
            />
            <div className="flex justify-end">
              <Button
                id={TRIAGE_CONTROL_IDS.reviewQuickSubmit}
                type="submit"
                size="sm"
                disabled={writing}
              >
                Submit review
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="manage" className="mt-3">
          <Accordion className="space-y-1">
            {/* Labels */}
            <AccordionItem className="border rounded-md">
              <AccordionTrigger className="py-2 px-3 text-xs font-medium">
                Labels
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="flex gap-2">
                  <Input
                    id={TRIAGE_CONTROL_IDS.labelInput}
                    data-control-id={TRIAGE_CONTROL_IDS.labelInput}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.labelInput}
                    value={form.labelName}
                    onChange={(e) => setFormField("labelName", e.target.value)}
                    placeholder="label-name"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    id={TRIAGE_CONTROL_IDS.labelAdd}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.labelName.trim()}
                    onClick={() => onMutateStringItem("labels", form.labelName, "POST")}
                  >
                    Add
                  </Button>
                  <Button
                    id={TRIAGE_CONTROL_IDS.labelRemove}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.labelName.trim()}
                    onClick={() => onMutateStringItem("labels", form.labelName, "DELETE")}
                  >
                    Remove
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Assignees */}
            <AccordionItem className="border rounded-md">
              <AccordionTrigger className="py-2 px-3 text-xs font-medium">
                Assignees
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="flex gap-2">
                  <Input
                    id={TRIAGE_CONTROL_IDS.assigneeInput}
                    data-control-id={TRIAGE_CONTROL_IDS.assigneeInput}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.assigneeInput}
                    value={form.assigneeLogin}
                    onChange={(e) => setFormField("assigneeLogin", e.target.value)}
                    placeholder="github-login"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    id={TRIAGE_CONTROL_IDS.assigneeAdd}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.assigneeLogin.trim()}
                    onClick={() => onMutateStringItem("assignees", form.assigneeLogin, "POST")}
                  >
                    Add
                  </Button>
                  <Button
                    id={TRIAGE_CONTROL_IDS.assigneeRemove}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.assigneeLogin.trim()}
                    onClick={() => onMutateStringItem("assignees", form.assigneeLogin, "DELETE")}
                  >
                    Remove
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Reviewers */}
            <AccordionItem className="border rounded-md">
              <AccordionTrigger className="py-2 px-3 text-xs font-medium">
                Reviewers
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="flex gap-2">
                  <Input
                    id={TRIAGE_CONTROL_IDS.reviewerInput}
                    data-control-id={TRIAGE_CONTROL_IDS.reviewerInput}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.reviewerInput}
                    value={form.reviewerLogin}
                    onChange={(e) => setFormField("reviewerLogin", e.target.value)}
                    placeholder="github-login"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    id={TRIAGE_CONTROL_IDS.reviewerAdd}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.reviewerLogin.trim()}
                    onClick={() => onMutateStringItem("reviewers", form.reviewerLogin, "POST")}
                  >
                    Add
                  </Button>
                  <Button
                    id={TRIAGE_CONTROL_IDS.reviewerRemove}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={writing || !form.reviewerLogin.trim()}
                    onClick={() => onMutateStringItem("reviewers", form.reviewerLogin, "DELETE")}
                  >
                    Remove
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Pending review */}
            <AccordionItem className="border rounded-md">
              <AccordionTrigger className="py-2 px-3 text-xs font-medium">
                Pending review
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <form onSubmit={onSubmitPendingReview} className="space-y-2">
                  <Select
                    id={TRIAGE_CONTROL_IDS.pendingReviewMode}
                    value={form.pendingReviewMode}
                    onChange={(e) => setFormField("pendingReviewMode", e.target.value as PendingReviewMode)}
                    className="h-8 text-xs"
                  >
                    <option value="pending_create">Create</option>
                    <option value="pending_submit">Submit</option>
                    <option value="pending_delete">Delete</option>
                  </Select>
                  {(form.pendingReviewMode === "pending_submit" || form.pendingReviewMode === "pending_delete") && (
                    <Input
                      id={TRIAGE_CONTROL_IDS.pendingReviewId}
                      value={form.pendingReviewId}
                      onChange={(e) => setFormField("pendingReviewId", e.target.value)}
                      placeholder="Review ID"
                      className="h-8 text-xs"
                    />
                  )}
                  <Textarea
                    value={form.reviewBody}
                    onChange={(e) => setFormField("reviewBody", e.target.value)}
                    placeholder="Optional body..."
                    rows={2}
                    disabled={form.pendingReviewMode === "pending_delete"}
                    className="min-h-[56px] resize-none text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      id={TRIAGE_CONTROL_IDS.pendingReviewSubmit}
                      type="submit"
                      size="sm"
                      className="text-xs"
                      disabled={writing}
                    >
                      {form.pendingReviewMode === "pending_create"
                        ? "Create"
                        : form.pendingReviewMode === "pending_submit"
                          ? "Submit"
                          : "Delete"}
                    </Button>
                  </div>
                </form>
              </AccordionContent>
            </AccordionItem>

            {/* Properties */}
            <AccordionItem className="border rounded-md">
              <AccordionTrigger className="py-2 px-3 text-xs font-medium">
                Properties
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <form onSubmit={onSubmitProperties} className="space-y-2">
                  <Input
                    id={TRIAGE_CONTROL_IDS.propertiesTitle}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesTitle}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesTitle}
                    value={form.propTitle}
                    onChange={(e) => setFormField("propTitle", e.target.value)}
                    placeholder="PR title"
                    className="h-8 text-xs"
                  />
                  <Textarea
                    id={TRIAGE_CONTROL_IDS.propertiesBody}
                    value={form.propBody}
                    onChange={(e) => setFormField("propBody", e.target.value)}
                    placeholder="PR description"
                    rows={3}
                    className="min-h-[56px] resize-none text-xs"
                  />
                  <Select
                    id={TRIAGE_CONTROL_IDS.propertiesState}
                    value={form.propState}
                    onChange={(e) => setFormField("propState", e.target.value as "open" | "closed")}
                    className="h-8 text-xs"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </Select>
                  <Input
                    id={TRIAGE_CONTROL_IDS.propertiesMilestone}
                    value={form.milestoneNumber}
                    onChange={(e) => setFormField("milestoneNumber", e.target.value)}
                    placeholder="Milestone number (optional)"
                    className="h-8 text-xs"
                  />
                  <Input
                    id={TRIAGE_CONTROL_IDS.propertiesProjects}
                    value={form.projectIdsCsv}
                    onChange={(e) => setFormField("projectIdsCsv", e.target.value)}
                    placeholder="Project IDs CSV (optional)"
                    className="h-8 text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      id={TRIAGE_CONTROL_IDS.propertiesSubmit}
                      type="submit"
                      size="sm"
                      className="text-xs"
                      disabled={writing}
                    >
                      Update
                    </Button>
                  </div>
                </form>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
}

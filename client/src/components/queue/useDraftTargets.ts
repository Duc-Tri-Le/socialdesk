import { useState, useEffect } from "react";
import type { Account, Draft, Group, Page } from "../../types";

export interface UseDraftTargetsOptions {
  draft: Draft;
  joinedGroups: Group[];
  allPages: Page[];
  igAccounts: Account[];
  onSaveTargets: (args: {
    id: number;
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => void;
}

export function useDraftTargets({
  draft: d,
  joinedGroups,
  allPages,
  igAccounts,
  onSaveTargets,
}: UseDraftTargetsOptions) {
  const savedTargets = d.pack_targets;

  const filterValidTargets = (targets: {
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => ({
    groups: targets.group_ids.filter((id) =>
      joinedGroups.some((g) => g.id === id),
    ),
    pages: targets.page_ids.filter((id) => allPages.some((p) => p.id === id)),
    igs: targets.instagram_account_ids.filter((id) =>
      igAccounts.some((a) => a.id === id),
    ),
  });

  const [selectedGroups, setSelectedGroups] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).groups;
    }
    return joinedGroups.filter((g) => g.is_target).map((g) => g.id);
  });

  const [selectedPages, setSelectedPages] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).pages;
    }
    return allPages.filter((p) => p.selected).map((p) => p.id);
  });

  const [selectedIg, setSelectedIg] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).igs;
    }
    return igAccounts.filter((a) => a.selected).map((a) => a.id);
  });

  // Đồng bộ lại khi dữ liệu đích từ server thay đổi
  const savedTargetsKey = `${savedTargets.saved}:${savedTargets.group_ids.join(",")}:${savedTargets.page_ids.join(",")}:${savedTargets.instagram_account_ids.join(",")}`;
  useEffect(() => {
    if (savedTargets.saved) {
      const valid = filterValidTargets(savedTargets);
      setSelectedGroups(valid.groups);
      setSelectedPages(valid.pages);
      setSelectedIg(valid.igs);
    }
  }, [savedTargetsKey, joinedGroups.length, allPages.length, igAccounts.length]);

  const applyTargets = (groups: number[], pages: number[], igs: number[]) => {
    setSelectedGroups(groups);
    setSelectedPages(pages);
    setSelectedIg(igs);
    onSaveTargets({
      id: d.id,
      group_ids: groups,
      page_ids: pages,
      instagram_account_ids: igs,
    });
  };

  const targetCount =
    selectedPages.length + selectedIg.length + selectedGroups.length;

  const pickedTargetNames = [
    ...allPages.filter((p) => selectedPages.includes(p.id)).map((p) => p.name),
    ...igAccounts
      .filter((a) => selectedIg.includes(a.id))
      .map((a) => `@${a.handle || a.name}`),
    ...joinedGroups
      .filter((g) => selectedGroups.includes(g.id))
      .map((g) => g.name),
  ];

  const targetSummaryText =
    targetCount === 0
      ? "Chưa chọn đích"
      : `${targetCount} đích (${pickedTargetNames.slice(0, 2).join(", ")}${
          targetCount > 2 ? ` +${targetCount - 2}` : ""
        })`;

  return {
    selectedGroups,
    selectedPages,
    selectedIg,
    targetCount,
    pickedTargetNames,
    targetSummaryText,
    applyTargets,
  };
}

import { useState, useEffect } from "react";
import type { Account, Draft, Group, Page } from "../../types";

export interface UseDraftTargetsOptions {
  draft: Draft;
  joinedGroups: Group[];
  allPages: Page[];
  igAccounts: Account[];
  mainAccounts?: Account[];
  onSaveTargets: (args: {
    id: number;
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
    account_ids: number[];
  }) => void;
}

export function useDraftTargets({
  draft: d,
  joinedGroups,
  allPages,
  igAccounts,
  mainAccounts = [],
  onSaveTargets,
}: UseDraftTargetsOptions) {
  const savedTargets = d.pack_targets;

  const filterValidTargets = (targets: {
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
    account_ids?: number[];
  }) => ({
    groups: targets.group_ids.filter((id) =>
      joinedGroups.some((g) => g.id === id),
    ),
    pages: targets.page_ids.filter((id) => allPages.some((p) => p.id === id)),
    igs: targets.instagram_account_ids.filter((id) =>
      igAccounts.some((a) => a.id === id),
    ),
    accounts: (targets.account_ids || []).filter((id) =>
      mainAccounts.some((a) => a.id === id),
    ),
  });

  const [selectedGroups, setSelectedGroups] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).groups;
    }
    return [];
  });

  const [selectedPages, setSelectedPages] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).pages;
    }
    return [];
  });

  const [selectedIg, setSelectedIg] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).igs;
    }
    return [];
  });

  const [selectedAccounts, setSelectedAccounts] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).accounts;
    }
    return [];
  });

  // Đồng bộ lại khi dữ liệu đích từ server thay đổi
  const savedTargetsKey = `${savedTargets.saved}:${savedTargets.group_ids.join(",")}:${savedTargets.page_ids.join(",")}:${savedTargets.instagram_account_ids.join(",")}:${(savedTargets.account_ids || []).join(",")}`;
  useEffect(() => {
    if (savedTargets.saved) {
      const valid = filterValidTargets(savedTargets);
      setSelectedGroups(valid.groups);
      setSelectedPages(valid.pages);
      setSelectedIg(valid.igs);
      setSelectedAccounts(valid.accounts);
    }
  }, [savedTargetsKey, joinedGroups.length, allPages.length, igAccounts.length, mainAccounts.length]);

  const applyTargets = (
    groups: number[],
    pages: number[],
    igs: number[],
    accounts: number[] = selectedAccounts,
  ) => {
    setSelectedGroups(groups);
    setSelectedPages(pages);
    setSelectedIg(igs);
    setSelectedAccounts(accounts);
    onSaveTargets({
      id: d.id,
      group_ids: groups,
      page_ids: pages,
      instagram_account_ids: igs,
      account_ids: accounts,
    });
  };

  const targetCount =
    selectedPages.length + selectedIg.length + selectedGroups.length + selectedAccounts.length;

  const pickedTargetNames = [
    ...allPages.filter((p) => selectedPages.includes(p.id)).map((p) => `Fanpage ${p.name}`),
    ...igAccounts
      .filter((a) => selectedIg.includes(a.id))
      .map((a) => `IG @${a.handle || a.name}`),
    ...joinedGroups
      .filter((g) => selectedGroups.includes(g.id))
      .map((g) => `Nhóm ${g.name}`),
    ...mainAccounts
      .filter((a) => selectedAccounts.includes(a.id))
      .map((a) => `Nick ${a.name}`),
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
    selectedAccounts,
    targetCount,
    pickedTargetNames,
    targetSummaryText,
    applyTargets,
  };
}

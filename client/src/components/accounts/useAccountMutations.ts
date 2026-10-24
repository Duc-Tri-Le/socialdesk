import { useMutation } from "@tanstack/react-query";
import { api } from "../../api";

export interface UseAccountMutationsOptions {
  setMsg: (msg: string) => void;
  setIsAddFormOpen: (open: boolean) => void;
  refresh: () => void;
  refetchExtensions: () => void;
}

export function useAccountMutations({
  setMsg,
  setIsAddFormOpen,
  refresh,
  refetchExtensions,
}: UseAccountMutationsOptions) {
  const addAccount = useMutation({
    mutationFn: (args: {
      platform: "Facebook" | "Instagram";
      name: string;
      profile_url: string;
      extension_code: string;
    }) =>
      api.addAccount({
        platform: args.platform,
        name: args.name,
        profile_url: args.profile_url,
        extension_code: args.extension_code,
        handle:
          args.platform === "Instagram"
            ? args.name
              ? `@${args.name.replace(/^@/, "")}`
              : "Tài khoản Instagram"
            : "",
        linked: true,
      }),
    onSuccess: (res) => {
      setMsg(res.message);
      if (res.ok) {
        setIsAddFormOpen(false);
      }
      refresh();
      refetchExtensions();
    },
  });

  const select = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setAccountSelected(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  const saveExtensionCode = useMutation({
    mutationFn: (args: { id: number; extension_code: string }) =>
      api.setAccountExtensionCode(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
      refetchExtensions();
    },
  });

  const setSessionStatus = useMutation({
    mutationFn: (args: {
      id: number;
      status: "logged_in" | "expired" | "checkpoint";
    }) => api.setAccountSessionStatus(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  const link = useMutation({
    mutationFn: (args: { id: number; linked: boolean }) =>
      api.setAccountLinked(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteAccount({ id }),
    onSuccess: () => {
      setMsg("Đã xóa tài khoản.");
      refresh();
    },
  });

  const saveUrl = useMutation({
    mutationFn: (args: { id: number; profile_url: string }) =>
      api.setAccountProfileUrl(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  const saveName = useMutation({
    mutationFn: (args: { id: number; name: string }) =>
      api.setAccountName(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  return {
    addAccount,
    select,
    saveExtensionCode,
    setSessionStatus,
    link,
    del,
    saveUrl,
    saveName,
  };
}

import type { KbGroup } from "./documentationTypes";

export const knowledgebaseGroups: KbGroup[] = [
  {
    id: "account",
    title: "Account & businesses",
    description: "One login, multiple company workspaces, and invites.",
    articleIds: [
      "add-another-business",
      "switch-between-businesses",
      "join-business-by-invite",
    ],
  },
  {
    id: "branches",
    title: "Branches & locations",
    description: "Set up warehouses or branches and choose which one you are working in.",
    articleIds: ["add-branch", "switch-active-branch"],
  },
  {
    id: "inventory",
    title: "Inventory scenarios",
    description: "Move, receive, or issue stock across locations.",
    articleIds: [
      "transfer-stock-between-branches",
      "receive-stock-at-branch",
      "issue-stock-from-branch",
    ],
  },
];

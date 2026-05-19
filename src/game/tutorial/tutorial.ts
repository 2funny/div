import type { GameState } from "../types";

export type TutorialStepId = "move" | "loot" | "battle" | "equip" | "quest" | "done";

export interface TutorialState {
  step: TutorialStepId;
  completed: TutorialStepId[];
}

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  desc: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "move",
    title: "迈出第一步",
    desc: "移动一格，确认周围的门、房间和可探索路线。"
  },
  {
    id: "loot",
    title: "打开一个宝箱",
    desc: "寻找宝箱或上锁宝箱，拿到第一批装备、符文或材料。"
  },
  {
    id: "battle",
    title: "赢下一场战斗",
    desc: "击败普通敌人，观察经验、金币和掉落奖励。"
  },
  {
    id: "equip",
    title: "换上一件装备",
    desc: "在背包里装备一件战利品，让角色的数值真正变强。"
  },
  {
    id: "quest",
    title: "接下一个委托",
    desc: "和中立委托人或商人交谈，接取一项可追踪目标。"
  },
  {
    id: "done",
    title: "目标链完成",
    desc: "继续深入地牢，围绕任务、钥匙和楼层封印推进。"
  }
];

const TUTORIAL_ORDER = TUTORIAL_STEPS.map((step) => step.id);

export function createTutorialState(): TutorialState {
  return { step: "move", completed: [] };
}

export function currentTutorialStep(state: GameState | null | undefined): TutorialStep | null {
  const tutorial = state?.tutorial as TutorialState | undefined;
  if (!tutorial || tutorial.step === "done") return null;
  return TUTORIAL_STEPS.find((step) => step.id === tutorial.step) || null;
}

export function advanceTutorial(
  state: GameState | null | undefined,
  completedStep: TutorialStepId
): boolean {
  const tutorial = state?.tutorial as TutorialState | undefined;
  if (!tutorial || tutorial.step === "done") return false;
  if (tutorial.step !== completedStep) return false;
  const currentIndex = TUTORIAL_ORDER.indexOf(completedStep);
  const nextStep = TUTORIAL_ORDER[currentIndex + 1] || "done";
  tutorial.completed = Array.from(new Set([...(tutorial.completed || []), completedStep]));
  tutorial.step = nextStep;
  return true;
}

import type { AppAction, FormState, ImageEntry, ModelState } from "./types";
import { DEFAULT_FORM } from "./types";

export interface AppState {
  modelState: ModelState;
  form: FormState;
  genStatus: import("./types").GenStatus;
  genStatusMsg: string;
  taskId: string | null;
  progress: number;
  totalSteps: number;
  images: ImageEntry[];
  selectedPreset: string | null;
}

export const initialState: AppState = {
  modelState: "idle",
  form: DEFAULT_FORM,
  genStatus: "idle",
  genStatusMsg: "",
  taskId: null,
  progress: 0,
  totalSteps: 0,
  images: [],
  selectedPreset: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_MODEL_STATE":
      return { ...state, modelState: action.state };

    case "SET_FORM":
      return { ...state, form: { ...state.form, ...action.form } };

    case "RESTORE_FORM":
      return { ...state, form: action.form };

    case "ADD_ELEMENT": {
      const id = crypto.randomUUID();
      return {
        ...state,
        form: {
          ...state.form,
          els: [...state.form.els, { id, type: "obj", text: "", bbox: "", desc: "" }],
        },
      };
    }

    case "REMOVE_ELEMENT":
      if (state.form.els.length <= 1) return state;
      return {
        ...state,
        form: {
          ...state.form,
          els: state.form.els.filter((_, i) => i !== action.index),
        },
      };

    case "UPDATE_ELEMENT": {
      const els = state.form.els.map((el, i) =>
        i === action.index ? { ...el, [action.field]: action.value } : el,
      );
      return { ...state, form: { ...state.form, els } };
    }

    case "SET_GEN_STATUS":
      return {
        ...state,
        genStatus: action.status,
        genStatusMsg: action.msg ?? "",
        taskId: action.taskId !== undefined ? action.taskId : state.taskId,
        progress: action.progress ?? state.progress,
        totalSteps: action.totalSteps ?? state.totalSteps,
      };

    case "ADD_IMAGE":
      return {
        ...state,
        images: [action.entry, ...state.images].slice(0, 20),
      };

    case "SET_IMAGES":
      return { ...state, images: action.entries };

    default:
      return state;
  }
}

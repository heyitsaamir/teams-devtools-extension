import { create } from 'zustand';

export interface ConnectionStore {
  botId: string;
  isCapturing: boolean;
  recentBotIds: string[];
  setBotId: (id: string) => void;
  setCapturing: (capturing: boolean) => void;
  loadPersistedState: () => void;
}

export const useConnectionStore = create<ConnectionStore>()((set, get) => ({
  botId: '',
  isCapturing: false,
  recentBotIds: [],

  setBotId: (id: string) => {
    set({ botId: id });
    // Persist to chrome.storage
    chrome.storage.local.set({ botId: id });
  },

  setCapturing: (capturing: boolean) => {
    const { botId, recentBotIds } = get();
    const updates: Partial<ConnectionStore> = { isCapturing: capturing };

    if (capturing && botId && !recentBotIds.includes(botId)) {
      const updated = [botId, ...recentBotIds].slice(0, 10);
      updates.recentBotIds = updated;
      chrome.storage.local.set({ recentBotIds: updated });
    }

    set(updates);
  },

  loadPersistedState: () => {
    chrome.storage.local.get(['botId', 'recentBotIds'], (result) => {
      set({
        botId: result.botId || '',
        recentBotIds: result.recentBotIds || [],
      });
    });
  },
}));

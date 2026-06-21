export type UIState = {
    equipment: any;
};

class UIStateStoreClass {
    private state: UIState = {
        equipment: null,
    };

    private listeners: Map<string, Function[]> = new Map();

    getState() {
        return this.state;
    }

    setEquipment(data: any) {
        this.state.equipment = data;

        const list = this.listeners.get("equipment");
        if (!list) return;

        setTimeout(() => {
            list.forEach(fn => fn(data));
        }, 0);
    }

    subscribe(key: string, fn: Function) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(fn);
    }

    private emit(key: string, data: any) {
        const list = this.listeners.get(key);
        if (!list) return;
        list.forEach(fn => fn(data));
    }
}

export const UIStateStore = new UIStateStoreClass();

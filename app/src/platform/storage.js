/** Acceso tolerante a localStorage (Safari privado, cuotas, modo restringido). */

const memory = new Map();

function backend() {
  try {
    const probe = '__mt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = backend();

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = store ? store.getItem(key) : memory.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (store) store.setItem(key, raw);
      else memory.set(key, raw);
      return true;
    } catch {
      memory.set(key, raw);
      return false;
    }
  },

  remove(key) {
    try {
      if (store) store.removeItem(key);
    } catch {
      /* ignorado: el respaldo en memoria sigue vivo */
    }
    memory.delete(key);
  },

  get raw() {
    return store;
  },
};

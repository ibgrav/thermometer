// See source at https://github.com/ibgrav/thermometer

export type TUnit = 'Fahrenheit' | 'Celsius';

export interface TEvent {
  previous: number | null;
  current: number;
}

export type TListener = (event: TEvent) => void;
export type TQualifier = (event: TEvent) => boolean;

/**
 * Future enhancements:
 * - It's a bit annoying that previousTemp defaults to null on initialization.
 *   - Not sure how to avoid this without causing potential for bugs.
 *   - Could set default to Infinity or NaN, but that's not really accurate.
 *   - Best solution if this is truly an issue is to only call listener on second temp reading.
 * Future performance improvements:
 * - Add a map to cache the qualifier results.
 * - Use a WeakMap for listeners store to avoid memory leak if user does not call `removeEventListener`.
 *   - The issue is WeakMap is not currently iterable.
 * - Extend the `addEventListener` API to include passing static values instead of a qualifier method. This would allow sorting the listeners in some way at `addEventListener` instead of having to call a qualifier method at every temp read.
 *   - The current implementation sacrifices performance for API flexibility and implementation simplicity.
 */
export class Thermometer {
  #defaultUnit: TUnit;
  #previousTemp: null | number = null;
  #listeners: Map<TListener, TQualifier> = new Map();

  constructor(defaultUnit: TUnit) {
    this.#defaultUnit = defaultUnit;
  }

  addEventListener(qualifier: TQualifier, listener: TListener) {
    this.#listeners.set(listener, qualifier);
  }

  removeEventListener(listener: TListener) {
    this.#listeners.delete(listener);
  }

  /**
   * Give user the option to convert result to a non-default value
   */
  convertUnit(unit: TUnit, value: number) {
    if (unit === 'Celsius') return value;
    return this.#toFahrenheit(value);
  }

  start(dataset: number[]) {
    /**
      This simulates polling for a temperature read.
      In a real application the dataset would not be supplied and `this.onTempRead` would be called after fetching the current temperature.
    */
    for (const data of dataset) {
      this.#onTempRead(data);
    }
  }

  #toFahrenheit(value: number) {
    return value * 1.8 + 32;
  }

  /**
   * Assumes temp value is Celsius as presented in example data
   */
  #onTempRead(temp: number) {
    for (const [listener, qualifier] of this.#listeners) {
      const event: TEvent = {
        current: this.convertUnit(this.#defaultUnit, temp),
        previous: null
      };

      if (this.#previousTemp !== null) {
        event.previous = this.convertUnit(this.#defaultUnit, this.#previousTemp);
      }

      if (qualifier(event)) {
        listener(event);
      }
    }

    this.#previousTemp = temp;
  }
}

// Generally these tests would be in thermometer.test.ts, but for the sake of keeping the result a single file they are inline.
if (import.meta.vitest) {
  const { describe, it, vi } = import.meta.vitest;

  describe('thermometer', () => {
    it('provides temperature in Celsius', ({ expect }) => {
      const thermometer = new Thermometer('Celsius');
      const listener: TListener = vi.fn();

      thermometer.addEventListener(() => true, listener);
      thermometer.start([101]);

      expect(listener).toHaveBeenCalledWith({ current: 101, previous: null });
    });

    it('provides temperature in Fahrenheit', ({ expect }) => {
      const thermometer = new Thermometer('Fahrenheit');
      const listener: TListener = vi.fn();

      thermometer.addEventListener(() => true, listener);
      thermometer.start([101]);

      expect(listener).toHaveBeenCalledWith({ current: 213.8, previous: null });
    });

    it('satisfies arbitrary thresholds such as freezing and boiling', ({ expect }) => {
      const thermometer = new Thermometer('Celsius');
      const boilingListener: TListener = vi.fn();
      const freezingListener: TListener = vi.fn();

      thermometer.addEventListener(({ current }) => current >= 100, boilingListener);
      thermometer.addEventListener(({ current }) => current <= 0, freezingListener);

      thermometer.start([15, 3000, 45, -10, 60]);

      expect(boilingListener).toHaveBeenCalledWith({ current: 3000, previous: 15 });
      expect(freezingListener).toHaveBeenCalledWith({ current: -10, previous: 45 });
    });

    it('calls listener only if delta threshold is met', ({ expect }) => {
      const thermometer = new Thermometer('Celsius');
      const listener: TListener = vi.fn();
      const qualifier: TQualifier = ({ current, previous }) =>
        previous !== null ? Math.abs(previous - current) > 0.5 : false;

      thermometer.addEventListener(qualifier, listener);
      thermometer.start([1.5, 1, 0.5, 0, -0.5, 0, 0.5, 0, 0.5, 1, 1.5, 0, 0.5, 1]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ current: 0, previous: 1.5 });
    });

    it('calls listener at freezing point only if the previous temperature was above freezing', ({ expect }) => {
      const thermometer = new Thermometer('Celsius');
      const listener: TListener = vi.fn();
      const qualifier: TQualifier = ({ current, previous }) =>
        previous !== null ? current <= 0 && previous > 0 : false;

      thermometer.addEventListener(qualifier, listener);
      thermometer.start([-10, -5, 0, 45, 25, -6, -10]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ current: -6, previous: 25 });
    });

    it('adds and removes listener', ({ expect }) => {
      const thermometer = new Thermometer('Celsius');
      const listener: TListener = vi.fn();

      thermometer.addEventListener(() => true, listener);
      thermometer.start([0]);

      expect(listener).toHaveBeenCalledTimes(1);

      thermometer.removeEventListener(listener);
      thermometer.start([0, 1, 2, 3]);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
}

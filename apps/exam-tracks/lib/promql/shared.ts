import { generate } from "./dataset";
import { Engine } from "./engine";

let engine: Engine | null = null;
/** One engine per process (or browser tab); the dataset is generated once. */
export function getEngine(): Engine {
  if (!engine) engine = new Engine(generate());
  return engine;
}

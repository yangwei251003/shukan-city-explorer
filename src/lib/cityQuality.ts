/** Device width affects pixel cost only; full model and texture assets are retained. */
export function cityQuality(fine:boolean,mobile:boolean){
 return {
  pixelRatioLimit:fine?(mobile?1.5:2):1,
  shadowSize:fine?2048:1024,
  reflectionSize:fine?512:256,
  reflectionInterval:fine?30:90,
  anisotropy:fine?8:2,
  tileError:fine?(mobile?8:6):24,
 };
}

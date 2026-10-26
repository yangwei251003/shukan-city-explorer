type GroupTile={content?:unknown;contents?:unknown[];children?:unknown[]};
// Sparse source trees contain non-renderable grouping nodes. A distant view must still reach
// their first drawable descendants; retain normal screen-error LOD selection once content exists.
export function needsDrawableChildren(tile:GroupTile){
 return !tile.content&&!tile.contents?.length&&!!tile.children?.length;
}

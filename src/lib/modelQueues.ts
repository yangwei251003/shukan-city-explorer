import {LRUCache,PriorityQueue,DownloadPriorityQueue,type TilesRendererBase} from '3d-tiles-renderer/core';
export function isolateModelQueues(tiles:Pick<TilesRendererBase,'lruCache'|'parseQueue'|'downloadQueue'|'processNodeQueue'>){
 const cache=new LRUCache(),parse=new PriorityQueue(),download=new DownloadPriorityQueue(),nodes=new PriorityQueue();
 cache.unloadPriorityCallback=tiles.lruCache.unloadPriorityCallback;
 parse.priorityCallback=tiles.parseQueue.priorityCallback;download.priorityCallback=tiles.downloadQueue.priorityCallback;
 nodes.priorityCallback=tiles.processNodeQueue.priorityCallback;nodes.autoUpdate=tiles.processNodeQueue.autoUpdate;nodes.maxJobs=tiles.processNodeQueue.maxJobs;
 tiles.lruCache=cache;tiles.parseQueue=parse;tiles.downloadQueue=download;tiles.processNodeQueue=nodes;
}

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import localforage from "localforage";

import { apiClient } from "@/services/api/request";
import { materializeGenerationTaskAssets } from "@/services/project-asset-sync";
import { initializeRemoteUserDataSession, resetRemoteUserDataSync } from "@/services/user-data-sync";
import { createProviderNeutralGenerationTaskEffectStore } from "@/services/provider-neutral-generation-effects";
import { ASSET_STORE_KEY, flushAssetStorePersistence, generationAssetId, useAssetStore, withAssetStorePersistenceSuppressed, type VideoAsset } from "@/stores/use-asset-store";

const originalAdapter = apiClient.defaults.adapter;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalGetItem = localforage.getItem;
const originalSetItem = localforage.setItem;
const originalRemoveItem = localforage.removeItem;
const originalCrypto = globalThis.crypto;

const scope = "generation-asset-http";
let storageValues = new Map<string, unknown>();

// 与后端 task_media_assets.go 的 generationMediaAssetID 同一公式。
const EXPECTED_ASSET_ID = "generation_9099fe9923e609a49c706b20bb916f4587bbed2fa2034ae1f81f30769dfe62f1";

const task = {
    id: "tsk_demo",
    type: "canvas_video",
    status: "succeeded" as const,
    prompt: "HTTP 下接回结果",
    attempts: 1,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:01.000Z",
    outputs: [{ outputIndex: 0, mediaType: "video" as const }],
    resultJson: JSON.stringify({ video: { dataUrl: "/api/resources/video-http/file", storageKey: "resource:video-http", width: 1280, height: 720, bytes: 100, mimeType: "video/mp4" } }),
};

const remoteAsset = (id: string): VideoAsset => ({
    id,
    kind: "video",
    title: "生成视频",
    coverUrl: "",
    tags: ["生成"],
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    metadata: { source: "generation-task", generationEffectKey: "materialize:tsk_demo:0", taskId: "tsk_demo", outputIndex: 0 },
    data: { url: "/api/resources/video-http/file", storageKey: "resource:video-http", width: 1280, height: 720, bytes: 100, mimeType: "video/mp4" },
});

function scopeStorageKey(name: string) {
    return `${name}:user:${scope}`;
}

/**
 * 只保留 getRandomValues，模拟 http://局域网IP 下的真实浏览器环境：
 * isSecureContext === false，crypto.subtle === undefined。
 */
function installInsecureCrypto() {
    const stub = { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) } as Crypto;
    Object.defineProperty(globalThis, "crypto", { value: stub, configurable: true, writable: true });
}

beforeEach(async () => {
    storageValues = new Map<string, unknown>();
    localforage.getItem = (async (key: string) => storageValues.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: unknown) => {
        storageValues.set(key, value);
        return value;
    }) as typeof localforage.setItem;
    localforage.removeItem = (async (key: string) => {
        storageValues.delete(key);
    }) as typeof localforage.removeItem;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key: string) => (key === "yingce:active-user-scope" ? scope : null),
                setItem: () => undefined,
                removeItem: () => undefined,
            },
            setTimeout,
            clearTimeout,
        },
    });
    installInsecureCrypto();
    storageValues.set(scopeStorageKey(ASSET_STORE_KEY), JSON.stringify({ state: { assets: [] }, version: 0, storageRevision: 0, tombstones: { assets: {} } }));
    withAssetStorePersistenceSuppressed(() => useAssetStore.setState({ assets: [] }));
    await flushAssetStorePersistence();
    await initializeRemoteUserDataSession("http-user");
});

afterEach(async () => {
    resetRemoteUserDataSync();
    apiClient.defaults.adapter = originalAdapter;
    withAssetStorePersistenceSuppressed(() => useAssetStore.setState({ assets: [] }));
    await flushAssetStorePersistence();
    localforage.getItem = originalGetItem;
    localforage.setItem = originalSetItem;
    localforage.removeItem = originalRemoveItem;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true, writable: true });
});

describe("非安全上下文（HTTP）下接回已完成任务", () => {
    test("没有 crypto.subtle 也能算出后端同一个素材 ID", async () => {
        expect(globalThis.crypto.subtle).toBeUndefined();
        expect(await generationAssetId("materialize:tsk_demo:0")).toBe(EXPECTED_ASSET_ID);
    });

    test("物化链路不抛错，并把后端已登记的同 ID 素材接回", async () => {
        apiClient.defaults.adapter = async (config) => {
            if (config.url === "/assets/batch") return { config, headers: {}, status: 200, statusText: "OK", data: { code: 0, data: { assets: [remoteAsset(EXPECTED_ASSET_ID)] }, msg: "ok" } };
            if (config.url === "/resources/access") return { config, headers: {}, status: 200, statusText: "OK", data: { code: 0, data: { items: [{ access: { url: "https://media.example.test/video.mp4", delivery: "origin" } }] }, msg: "ok" } };
            throw new Error(`Unexpected request: ${config.method} ${config.url}`);
        };
        // 修复前这里会抛 "Cannot read properties of undefined (reading 'digest')"。
        const materialized = await materializeGenerationTaskAssets(task);
        expect(materialized.outputs?.[0]?.materializedAssetId).toBe(EXPECTED_ASSET_ID);
        expect(useAssetStore.getState().assets.map((item) => item.id)).toContain(EXPECTED_ASSET_ID);
    });
});

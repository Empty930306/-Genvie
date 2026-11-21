package app

import (
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/protocol"
)

func requestManifestRecord(t *testing.T, id, version string) pluginRegistryRecord {
	t.Helper()
	manifest := protocol.Manifest{
		Metadata: protocol.Metadata{ID: id, Version: version},
		Contributes: protocol.ManifestContributions{
			Providers: []protocol.ManifestProvider{{ID: id + "-provider"}},
		},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return pluginRegistryRecord{ID: id, Raw: raw, PackagePath: id + ".yingce-plugin", PackageSHA256: "old-digest"}
}

// 官方内置插件重打包会改变摘要但保持版本号；bootstrap 以镜像内的官方包为准，
// 必须替换同一版本记录，否则升级后后端因摘要不一致而拒绝启动。
func TestRetainRequestPackageAllowsOfficialRepack(t *testing.T) {
	record := requestManifestRecord(t, "a6api", "1.0.0")
	next := protocol.Manifest{
		Metadata: protocol.Metadata{ID: "a6api", Version: "1.0.0"},
		Contributes: protocol.ManifestContributions{
			Providers: []protocol.ManifestProvider{{ID: "a6api-provider"}},
		},
	}

	history, err := retainRequestPackage(record, next, "new-digest", false)
	if err != nil {
		t.Fatalf("official repack must not block startup: %v", err)
	}
	if len(history) != 0 {
		t.Fatalf("same version repack must not add history: %#v", history)
	}
}

// 用户上传路径必须继续拒绝同版本不同摘要，避免覆盖已发布的请求插件版本。
func TestRetainRequestPackageRejectsUploadedDigestChange(t *testing.T) {
	record := requestManifestRecord(t, "custom", "2.0.0")
	next := protocol.Manifest{
		Metadata: protocol.Metadata{ID: "custom", Version: "2.0.0"},
		Contributes: protocol.ManifestContributions{
			Providers: []protocol.ManifestProvider{{ID: "custom-provider"}},
		},
	}

	_, err := retainRequestPackage(record, next, "other-digest", true)
	if err == nil {
		t.Fatal("uploaded plugin with same version and different digest must be rejected")
	}
	if !strings.Contains(err.Error(), "包摘要不同") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// 版本号真正变化时，旧版本必须进入历史，两条路径行为一致。
func TestRetainRequestPackageRecordsVersionBump(t *testing.T) {
	for _, strict := range []bool{false, true} {
		record := requestManifestRecord(t, "custom", "1.0.0")
		next := protocol.Manifest{
			Metadata: protocol.Metadata{ID: "custom", Version: "1.1.0"},
			Contributes: protocol.ManifestContributions{
				Providers: []protocol.ManifestProvider{{ID: "custom-provider"}},
			},
		}

		history, err := retainRequestPackage(record, next, "new-digest", strict)
		if err != nil {
			t.Fatalf("strict=%v: %v", strict, err)
		}
		if len(history) != 1 || history[0].Version != "1.0.0" || history[0].SHA256 != "old-digest" {
			t.Fatalf("strict=%v: unexpected history %#v", strict, history)
		}
	}
}

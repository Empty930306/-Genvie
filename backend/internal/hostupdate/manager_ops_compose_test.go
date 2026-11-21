package hostupdate

import (
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

// GitHub 允许仓库所有者含大写，但 OCI 镜像仓库名必须全小写，
// 否则 docker 会以 invalid reference format 拒绝整个镜像清单检测。
func TestImmutableImageRefsLowercasesOwner(t *testing.T) {
	images := immutableImageRefs("Empty616165/genvie", "v1.8.7.5")
	for _, image := range []string{images.backend, images.web, images.agent} {
		if strings.Contains(image, "Empty616165") {
			t.Fatalf("owner was not lowercased: %s", image)
		}
		if !strings.HasPrefix(image, "ghcr.io/empty616165/genvie-canvas-") {
			t.Fatalf("unexpected image reference: %s", image)
		}
		if !strings.HasSuffix(image, ":1.8.7.5") {
			t.Fatalf("unexpected image tag: %s", image)
		}
	}
}

// raw.githubusercontent.com 在部分网络被封禁，Release 资产包含同一份 Compose，
// 因此首个地址失败时必须继续尝试后续候选地址，而不是让整项检测失败。
func TestPrepareTargetComposeFallsBackToReleaseAsset(t *testing.T) {
	m := sourceManager(t)
	var hosts []string
	m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
		hosts = append(hosts, r.URL.Host)
		if r.URL.Host == "raw.githubusercontent.com" {
			return nil, io.ErrUnexpectedEOF
		}
		return sourceResponse(http.StatusOK, "services: {}\n"), nil
	})

	path, err := m.prepareTargetCompose("v1.8.7.5", Sources{"direct", "ghcr"})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	if len(hosts) != 2 || hosts[0] != "raw.githubusercontent.com" || hosts[1] != "github.com" {
		t.Fatalf("unexpected candidates: %#v", hosts)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "services: {}\n" {
		t.Fatalf("unexpected compose content: %q", data)
	}
}

// 两个候选地址都不可用时必须在错误里带上各自原因，便于区分网络封锁与文件缺失。
func TestPrepareTargetComposeReportsEveryFailure(t *testing.T) {
	m := sourceManager(t)
	m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
		return nil, io.ErrUnexpectedEOF
	})

	_, err := m.prepareTargetCompose("v1.8.7.5", Sources{"direct", "ghcr"})
	if err == nil {
		t.Fatal("expected failure when every compose candidate is unreachable")
	}
	if strings.Count(err.Error(), "unexpected EOF") != 2 {
		t.Fatalf("expected both candidate failures: %v", err)
	}
}

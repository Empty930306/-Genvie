package hostupdate

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// Release 二进制可达数 MB，经镜像代理时吞吐可能只有数十 KB/s。
// 若给 http.Client 设置覆盖 body 读取的 Timeout，大文件下载会在传输中途被切断，
// 表现成 preflight 阶段的“下载目标 Host Updater 超时”。这里锁住该回归。
func TestManagerHTTPClientDoesNotCapBodyRead(t *testing.T) {
	m := sourceManager(t)
	if m.httpClient.Timeout != 0 {
		t.Fatalf("http.Client.Timeout must stay 0 so body reads are governed by request context, got %s", m.httpClient.Timeout)
	}
	if m.httpClient.Transport == nil {
		t.Fatal("http client must use an explicit transport with connect/header timeouts")
	}
}

// 大体积资产必须能完整读到结束，不能被客户端整体超时截断。
func TestDownloadReleaseAssetReadsLargeBody(t *testing.T) {
	m := sourceManager(t)
	payload := strings.Repeat("x", 3<<20)
	m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
		return sourceResponse(http.StatusOK, payload), nil
	})

	data, err := m.downloadReleaseAsset("https://github.com/empty616165/genvie/releases/download/v1.8.7.7/open-ai-canvas-host-updater-linux-amd64", 128<<20, Sources{"direct", "ghcr"})
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != len(payload) {
		t.Fatalf("truncated download: got %d bytes, want %d", len(data), len(payload))
	}
}

// 资产超过上限时必须在读取阶段拦截，避免无限制占用内存。
func TestDownloadReleaseAssetRejectsOversizeBody(t *testing.T) {
	m := sourceManager(t)
	m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
		return sourceResponse(http.StatusOK, strings.Repeat("y", 64)), nil
	})

	if _, err := m.downloadReleaseAsset("https://github.com/empty616165/genvie/releases/download/v1.8.7.7/SHA256SUMS", 32, Sources{"direct", "ghcr"}); err == nil {
		t.Fatal("oversize asset must be rejected")
	}
}

// 下载仍受请求 context 约束：超时后必须返回错误而不是无限等待。
func TestDownloadReleaseAssetHonoursContext(t *testing.T) {
	m := sourceManager(t)
	blocked := make(chan struct{})
	defer close(blocked)
	m.httpClient.Transport = sourceTransport(func(r *http.Request) (*http.Response, error) {
		select {
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-blocked:
			return sourceResponse(http.StatusOK, ""), nil
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := m.githubGet(ctx, "https://github.com/empty616165/genvie/releases/download/v1.8.7.7/SHA256SUMS", Sources{"direct", "ghcr"}, ""); err == nil {
		t.Fatal("cancelled request must fail")
	}
}

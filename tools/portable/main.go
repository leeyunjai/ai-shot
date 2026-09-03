// AI Shot portable — the whole site embedded in one exe.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os/exec"
	"time"
)

//go:embed all:site
var siteFS embed.FS

const basePort = 50040

func main() {
	// MediaPipe 파일들의 MIME 을 명시 등록한다.
	// .wasm 이 틀리면 스트리밍 컴파일이 실패하고, 모델 파일은 octet-stream 이어야 한다.
	mime.AddExtensionType(".wasm", "application/wasm")
	mime.AddExtensionType(".mjs", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".task", "application/octet-stream")
	mime.AddExtensionType(".tflite", "application/octet-stream")

	sub, _ := fs.Sub(siteFS, "site")

	port := basePort
	var ln net.Listener
	var err error
	for i := 0; i < 10; i++ {
		ln, err = net.Listen("tcp", fmt.Sprintf("localhost:%d", port))
		if err == nil {
			break
		}
		port++
	}
	if ln == nil {
		fmt.Println("no free port found near", basePort)
		fmt.Scanln()
		return
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	fmt.Println("AI Shot -", url)
	fmt.Println("Close this window to stop.")

	go func() {
		time.Sleep(600 * time.Millisecond)
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	}()

	http.Serve(ln, http.FileServer(http.FS(sub)))
}

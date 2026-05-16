# Минимальный dev-сервер: статические файлы + no-cache заголовки.
# Браузеры агрессивно кэшируют ES-модули по URL, что мешает при разработке —
# изменения JS не подхватываются без жёсткой перезагрузки. С этими заголовками
# каждое обращение получает свежую версию.
#
# Важно: ThreadingHTTPServer (не HTTPServer) — обычный одно-потоковый сервер
# виснет, если хоть один клиент держит соединение открытым (Chrome preview-tab
# часто так делает). С пулом потоков новые запросы не блокируются хвостами.
# allow_reuse_address — чтобы порт сразу освобождался при рестарте, не уходя
# в TIME_WAIT.
#
# Запускается из .claude/launch.json (порт 8773 — закреплён за этим проектом,
# см. CLAUDE.md).
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import sys


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


class DevServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True  # потоки-обработчики не мешают завершению процесса


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8773
    httpd = DevServer(('', port), NoCacheHandler)
    print(f'Serving on http://localhost:{port}/ with no-cache headers (threaded)')
    httpd.serve_forever()

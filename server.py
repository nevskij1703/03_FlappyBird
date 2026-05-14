# Минимальный dev-сервер: статические файлы + no-cache заголовки.
# Браузеры агрессивно кэшируют ES-модули по URL, что мешает при разработке —
# изменения JS не подхватываются без жёсткой перезагрузки. С этими заголовками
# каждое обращение получает свежую версию.
#
# Запускается из .claude/launch.json (порт 8773 — закреплён за этим проектом,
# см. CLAUDE.md).
from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8773
    httpd = HTTPServer(('', port), NoCacheHandler)
    print(f'Serving on http://localhost:{port}/ with no-cache headers')
    httpd.serve_forever()

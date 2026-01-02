FROM nginx:alpine

# srcディレクトリの内容をnginxの公開ディレクトリにコピー
COPY src/ /usr/share/nginx/html/

# Cloud RunのPORT環境変数に対応するための設定
# 起動時にdefault.confのlistenポートをPORT環境変数の値に置き換えます
CMD ["/bin/sh", "-c", "sed -i 's/listen       80;/listen '${PORT:-8080}';/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

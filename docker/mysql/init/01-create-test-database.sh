#!/bin/bash
# Executado pelo entrypoint do MySQL apenas na primeira inicialização do volume.
# Cria o banco usado pelos testes de integração (<DB_DATABASE>_test) e dá acesso ao usuário da aplicação.
set -euo pipefail

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}_test\`;
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}_test\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL

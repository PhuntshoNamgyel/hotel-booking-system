#!/bin/bash
set -e

create_db() {
  local db_name="$1"
  local db_user="$2"
  local db_pass="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<EOSQL
CREATE USER ${db_user} WITH PASSWORD '${db_pass}';
CREATE DATABASE ${db_name} OWNER ${db_user};
REVOKE CONNECT ON DATABASE ${db_name} FROM PUBLIC;
EOSQL
}

create_db hotel_db hotel_user "$HOTEL_DB_PASSWORD"
create_db booking_db booking_user "$BOOKING_DB_PASSWORD"
create_db payment_db payment_user "$PAYMENT_DB_PASSWORD"
create_db notification_db notification_user "$NOTIFICATION_DB_PASSWORD"
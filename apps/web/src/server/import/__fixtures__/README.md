`rows.parquet` is a hand-built two-row file (pyarrow, SNAPPY, one row group
per row) carrying the upstream shapes the reader has to get exactly right: an
int64 id, a nanosecond timestamp, and a struct whose child field names contain
literal dots. It is not source data — it exists so parquet.test.ts can assert
value normalization and row-group streaming without the network.

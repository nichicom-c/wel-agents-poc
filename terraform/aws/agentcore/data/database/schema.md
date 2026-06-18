# Sample business data schema

Synthetic sample data for the RAG PoC. Not real WEL-MOTHER data.

## customers.csv

| column        | description                          |
| ------------- | ------------------------------------ |
| customer_id   | Unique customer identifier (C0001-)  |
| name          | Customer display name                |
| region        | Sales region (Tokyo / Osaka / Nagoya)|
| signup_date   | ISO date the customer signed up      |

## products.csv

| column      | description                         |
| ----------- | ----------------------------------- |
| product_id  | Unique product identifier (P001-)   |
| name        | Product name                        |
| category    | Product category                    |
| unit_price  | Price per unit in JPY               |

## orders.csv

| column      | description                              |
| ----------- | ---------------------------------------- |
| order_id    | Unique order identifier (O1001-)         |
| customer_id | References customers.customer_id         |
| product_id  | References products.product_id           |
| quantity    | Number of units ordered                  |
| order_date  | ISO date the order was placed            |

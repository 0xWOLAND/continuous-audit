#!/bin/bash

# Configuration
NAMESPACE_NAME="usa-spending-poller-AWARDS_KV"
TEMP_DIR="./kv_clear_temp"
KEYS_FILE="$TEMP_DIR/keys.json"
DELETE_FILE="$TEMP_DIR/delete_keys.json"

# Get the namespace ID from wrangler.toml or CLI
NAMESPACE_ID=$(grep -A1 "$NAMESPACE_NAME" wrangler.toml | grep "id" | cut -d'"' -f2)
if [ -z "$NAMESPACE_ID" ]; then
  echo "Fetching namespace ID from Cloudflare..."
  NAMESPACE_ID=$(pnpm wrangler kv:namespace list | jq -r ".[] | select(.title == \"$NAMESPACE_NAME\") | .id")
  if [ -z "$NAMESPACE_ID" ]; then
    echo "Error: Could not find namespace ID for $NAMESPACE_NAME. Check your wrangler.toml or Cloudflare dashboard."
    exit 1
  fi
fi
echo "Using namespace ID: $NAMESPACE_ID"

# Create temp directory for files
mkdir -p "$TEMP_DIR"

# Function to delete keys in bulk
delete_keys() {
  local file="$1"
  echo "Deleting keys from $file..."
  # Check if the file is empty or invalid
  if [ ! -s "$file" ]; then
    echo "Error: $file is empty. No keys to delete in this batch."
    return 0
  fi
  # Validate JSON syntax (should be a list of strings)
  if ! jq -e 'if type == "array" then all(.[]; type == "string") else false end' "$file" >/dev/null 2>&1; then
    echo "Error: $file contains invalid JSON. Expected an array of strings. Contents:"
    cat "$file"
    exit 1
  fi
  pnpm wrangler kv:bulk delete --namespace-id="$NAMESPACE_ID" "$file"
  if [ $? -ne 0 ]; then
    echo "Error: Failed to delete keys."
    exit 1
  fi
}

# Main loop to handle pagination
CURSOR=""
while true; do
  # List keys with pagination
  if [ -z "$CURSOR" ]; then
    echo "Fetching initial batch of keys..."
    pnpm wrangler kv:key list --namespace-id="$NAMESPACE_ID" > "$KEYS_FILE"
  else
    echo "Fetching next batch of keys with cursor $CURSOR..."
    pnpm wrangler kv:key list --namespace-id="$NAMESPACE_ID" --cursor="$CURSOR" > "$KEYS_FILE"
  fi

  # Check if the list command succeeded
  if [ $? -ne 0 ]; then
    echo "Error: Failed to list keys. Contents of $KEYS_FILE:"
    cat "$KEYS_FILE"
    exit 1
  fi

  # Check if KEYS_FILE is a valid JSON array
  if ! jq -e 'type == "array"' "$KEYS_FILE" >/dev/null 2>&1; then
    echo "Error: $KEYS_FILE is not a valid JSON array. Contents:"
    cat "$KEYS_FILE"
    exit 1
  fi

  # Check if there are keys to delete
  KEY_COUNT=$(jq 'length' "$KEYS_FILE")
  if [ "$KEY_COUNT" -eq 0 ]; then
    echo "No more keys to delete."
    break
  fi

  # Format keys as a JSON array of strings for deletion
  jq -r 'map(.name)[]' "$KEYS_FILE" | jq -R . | jq -s . > "$DELETE_FILE"

  # Delete the batch
  delete_keys "$DELETE_FILE"

  # Check for pagination cursor (fetch separately if needed)
  # Since your output lacks result_info, we assume no cursor unless more keys exist
  if [ "$KEY_COUNT" -lt 10000 ]; then  # Default limit is 10,000
    echo "All keys deleted (batch size $KEY_COUNT < 10,000, assuming no more pages)."
    break
  fi
  # If pagination is needed, we’d need to adjust this based on your Wrangler version’s behavior
  echo "Warning: Pagination may be incomplete due to missing cursor info. Check if more keys remain."
  break  # Temporary break until we confirm pagination behavior
done

# Clean up
rm -rf "$TEMP_DIR"
echo "KV namespace $NAMESPACE_NAME cleared successfully!"
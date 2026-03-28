import pandas as pd

print("Loading dataset...")
# Load the dataset (we load the whole thing this time just to get all names)
df = pd.read_csv("DataCoSupplyChainDataset.csv", encoding='latin1')

# Extract unique cities from both columns
sources = set(df['Customer City'].dropna().unique())
dests = set(df['Order City'].dropna().unique())
all_cities = list(sources.union(dests))

print(f"Found {len(all_cities)} unique cities.")

# Save to a text file
with open("unique_cities.txt", "w", encoding='utf-8') as f:
    f.write("\n".join(all_cities))

print("Saved to unique_cities.txt!")
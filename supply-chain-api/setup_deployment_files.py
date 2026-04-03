#!/usr/bin/env python3
"""
Setup script to generate required deployment files
Run this after deployment to create the necessary model files
"""

import os
import subprocess
import sys

def run_pipeline():
    """Run the data pipeline to generate nodes.json and edges.json"""
    print("🚀 Running data pipeline...")
    try:
        result = subprocess.run([sys.executable, "pipeline.py"], 
                              capture_output=True, text=True, timeout=600)
        if result.returncode == 0:
            print("✅ Pipeline completed successfully")
            return True
        else:
            print(f"❌ Pipeline failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Pipeline timed out")
        return False
    except Exception as e:
        print(f"❌ Pipeline error: {e}")
        return False

def run_training():
    """Run the training script to generate model files"""
    print("🧠 Running model training...")
    try:
        result = subprocess.run([sys.executable, "train.py"], 
                              capture_output=True, text=True, timeout=1200)
        if result.returncode == 0:
            print("✅ Training completed successfully")
            return True
        else:
            print(f"❌ Training failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Training timed out")
        return False
    except Exception as e:
        print(f"❌ Training error: {e}")
        return False

def check_required_files():
    """Check if all required files exist"""
    required_files = [
        "nodes.json",
        "edges.json", 
        "supply_chain_model.pth",
        "node_scaler.pkl",
        "edge_scaler.pkl",
        "category_mapping.json",
        "feature_schema.json",
        "nodes_inference.json",
        "edges_inference.json"
    ]
    
    missing_files = []
    for file in required_files:
        if not os.path.exists(file):
            missing_files.append(file)
    
    if missing_files:
        print(f"❌ Missing files: {missing_files}")
        return False
    
    print("✅ All required files present")
    return True

def main():
    print("🔧 Setting up deployment files...")
    
    # Check if we need to generate files
    if not check_required_files():
        print("📊 Generating missing files...")
        
        # Run pipeline if needed
        if not os.path.exists("nodes.json") or not os.path.exists("edges.json"):
            if not run_pipeline():
                print("❌ Cannot proceed without pipeline files")
                return False
        
        # Run training if needed  
        if not os.path.exists("supply_chain_model.pth"):
            if not run_training():
                print("❌ Cannot proceed without model files")
                return False
        
        # Final check
        if not check_required_files():
            print("❌ Some files are still missing")
            return False
    
    print("✅ Deployment files ready!")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

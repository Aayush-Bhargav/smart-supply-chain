# ============================================================
# FEATURE LAYOUT
# Must match pipeline.py exactly
# [distance, cross_border, month_sin, month_cos, day_sin, day_cos,
#  hour_sin, hour_cos, scheduled_days, preference, quantity,
#  physical_mode, category_one_hot...]
# ============================================================
DIST_IDX = 0
CROSS_BORDER_IDX = 1
MONTH_SIN_IDX = 2
MONTH_COS_IDX = 3
DAY_SIN_IDX = 4
DAY_COS_IDX = 5
HOUR_SIN_IDX = 6
HOUR_COS_IDX = 7
SCHEDULED_DAYS_IDX = 8
PREFERENCE_IDX = 9
QUANTITY_IDX = 10
PHYSICAL_MODE_IDX = 11
CATEGORY_START_IDX = 12

PHYSICAL_MODE_TO_IDX = {
    "Truck": 0.0,
    "Air": 1.0,
    "Ocean": 2.0,
}

PRIORITY_TO_ENCODING = {
    "Standard Class": 0.0,
    "Second Class": 1.0,
    "First Class": 2.0,
    "Same Day": 3.0,
    "Standard": 0.0,
    "Second": 1.0,
    "First": 2.0,
    "Urgent": 3.0,
}

PRIORITY_TO_SCHEDULED_DAYS = {
    0.0: 4.0,
    1.0: 3.0,
    2.0: 2.0,
    3.0: 0.0,
}

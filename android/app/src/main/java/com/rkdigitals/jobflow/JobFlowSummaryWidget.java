package com.rkdigitals.jobflow;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** 4x2 widget: business, jobs in production, delayed jobs, customers, add-customer button. */
public class JobFlowSummaryWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, JobFlowWidgets.summary(context));
    }
}

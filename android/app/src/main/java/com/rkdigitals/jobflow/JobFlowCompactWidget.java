package com.rkdigitals.jobflow;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** 2x1 widget: delayed jobs and changes waiting to sync. */
public class JobFlowCompactWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, JobFlowWidgets.compact(context));
    }
}

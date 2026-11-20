package com.rkdigitals.jobflow;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Shared drawing code for the JobFlow home-screen widgets. */
final class JobFlowWidgets {
    static final String PREFS = "jobflow_widgets";
    static final String KEY_SNAPSHOT = "snapshot";
    static final String LINK_HOME = "com.rkdigitals.jobflow://open/";
    static final String LINK_NEW_CUSTOMER = "com.rkdigitals.jobflow://open/customers?new=1";

    private static final int INK = 0xFF14213D;
    private static final int CRITICAL = 0xFFB8322A;
    private static final int GOOD = 0xFF1E7A4A;
    private static final int WARNING = 0xFF9A5B00;

    private JobFlowWidgets() {}

    static JSONObject snapshot(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static PendingIntent openLink(Context context, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String count(JSONObject data, String key) {
        return data == null ? "-" : String.valueOf(data.optInt(key, 0));
    }

    static RemoteViews summary(Context context) {
        JSONObject data = snapshot(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_summary);
        views.setTextViewText(R.id.widget_business, data == null ? "Open JobFlow to load" : data.optString("business", "JobFlow"));
        views.setTextViewText(R.id.widget_in_production, count(data, "inProduction"));
        views.setTextViewText(R.id.widget_delayed, count(data, "delayed"));
        views.setTextViewTextColor(R.id.widget_delayed, data != null && data.optInt("delayed", 0) > 0 ? CRITICAL : INK);
        views.setTextViewText(R.id.widget_customers, count(data, "customers"));
        views.setTextViewText(R.id.widget_footer, footer(data));
        views.setTextViewTextColor(R.id.widget_footer, footerColor(data));
        views.setOnClickPendingIntent(R.id.widget_root, openLink(context, LINK_HOME, 1));
        views.setOnClickPendingIntent(R.id.widget_add_customer, openLink(context, LINK_NEW_CUSTOMER, 2));
        return views;
    }

    static RemoteViews compact(Context context) {
        JSONObject data = snapshot(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_compact);
        views.setTextViewText(R.id.widget_compact_delayed, count(data, "delayed"));
        views.setTextViewTextColor(R.id.widget_compact_delayed, data != null && data.optInt("delayed", 0) > 0 ? CRITICAL : INK);
        views.setTextViewText(R.id.widget_compact_waiting, count(data, "waitingSync"));
        views.setTextViewText(R.id.widget_compact_footer, data != null && data.optBoolean("demo", false) ? "Demo data" : syncWord(data));
        views.setTextViewTextColor(R.id.widget_compact_footer, footerColor(data));
        views.setOnClickPendingIntent(R.id.widget_compact_root, openLink(context, LINK_HOME, 3));
        return views;
    }

    private static String syncWord(JSONObject data) {
        if (data == null) return "Open JobFlow";
        return data.optString("syncLabel", "");
    }

    private static String footer(JSONObject data) {
        if (data == null) return "Tap to open JobFlow";
        String updated = data.optString("updatedLabel", "");
        String sync = data.optString("syncLabel", "");
        if (data.optBoolean("demo", false)) return "Demo data - updated " + updated;
        return sync.isEmpty() ? "Updated " + updated : sync + " - updated " + updated;
    }

    private static int footerColor(JSONObject data) {
        if (data == null) return INK;
        if (data.optBoolean("demo", false)) return WARNING;
        String tone = data.optString("syncTone", "");
        if ("bad".equals(tone)) return CRITICAL;
        if ("wait".equals(tone)) return WARNING;
        if ("good".equals(tone)) return GOOD;
        return INK;
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] summaryIds = manager.getAppWidgetIds(new ComponentName(context, JobFlowSummaryWidget.class));
        for (int id : summaryIds) manager.updateAppWidget(id, summary(context));
        int[] compactIds = manager.getAppWidgetIds(new ComponentName(context, JobFlowCompactWidget.class));
        for (int id : compactIds) manager.updateAppWidget(id, compact(context));
    }
}

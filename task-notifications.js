// Native task completion signals; task text is kept out of Windows notifications.
function createTaskNotifications({ Notification, getWindow }) {
  const running = new Set(),
    notifications = new Set();
  const window = () => {
    const win = getWindow();
    return win && !win.isDestroyed() ? win : null;
  };
  function progress() {
    try {
      window()?.setProgressBar?.(running.size ? 2 : -1);
    } catch {}
  }
  return {
    started(job) {
      running.add(job.id);
      progress();
    },
    finished(job, { silent = false } = {}) {
      if (!running.delete(job.id)) return;
      progress();
      if (silent || !['completed', 'failed', 'needs_attention', 'limit_reached'].includes(job.status)) return;
      const win = window();
      try {
        if (win && !win.isFocused?.()) win.flashFrame?.(true);
      } catch {}
      try {
        if (!Notification?.isSupported()) return;
        const notice = new Notification({
          title: job.status === 'completed' ? 'ATLAS task complete' : 'ATLAS task needs attention',
          body:
            (job.collaboration ? 'Colab' : 'Assistant') +
            (job.status === 'completed'
              ? ' finished your task.'
              : ' could not finish your task. Open ATLAS for details.'),
        });
        notifications.add(notice);
        notice.once('close', () => notifications.delete(notice));
        notice.once('click', () => {
          notifications.delete(notice);
          const current = window();
          if (!current) return;
          try {
            if (current.isMinimized?.()) current.restore();
            current.show();
            current.focus();
            current.flashFrame?.(false);
            current.webContents.send('atlas:task-open', {
              id: job.id,
              conversationId: job.conversationId,
              colabChatId: job.colabChatId,
              collaboration: Boolean(job.collaboration),
            });
          } catch {}
        });
        notice.show();
      } catch {} // Unavailable Windows notifications must never fail a task.
    },
  };
}
module.exports = { createTaskNotifications };

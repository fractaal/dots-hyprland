const { Gtk, Gdk, GLib } = imports.gi;
import App from 'resource:///com/github/Aylur/ags/app.js';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
const { execAsync, exec } = Utils;
import { searchItem } from './searchitem.js';
import { execAndClose, couldBeMath, launchCustomCommand } from './miscfunctions.js';
import GeminiService from '../../services/gemini.js';

// For context menu positioning
const Gravity = Gdk.Gravity;

export const NoResultButton = () => searchItem({
    materialIconName: 'Error',
    name: "Search invalid",
    content: "No results found!",
    onActivate: () => {
        App.closeWindow('overview');
    },
});

export const DirectoryButton = ({ parentPath, name, type, icon }) => {
    const actionText = Widget.Revealer({
        revealChild: false,
        transition: "crossfade",
        transitionDuration: userOptions.animations.durationLarge,
        child: Widget.Label({
            className: 'overview-search-results-txt txt txt-small txt-action',
            label: 'Open',
        })
    });
    const actionTextRevealer = Widget.Revealer({
        revealChild: false,
        transition: "slide_left",
        transitionDuration: userOptions.animations.durationSmall,
        child: actionText,
    });
    return Widget.Button({
        className: 'overview-search-result-btn',
        onClicked: () => {
            App.closeWindow('overview');
            execAsync(['bash', '-c', `xdg-open '${parentPath}/${name}'`, `&`]).catch(print);
        },
        child: Widget.Box({
            children: [
                Widget.Box({
                    vertical: false,
                    children: [
                        Widget.Box({
                            className: 'overview-search-results-icon',
                            homogeneous: true,
                            child: Widget.Icon({
                                icon: icon,
                            }),
                        }),
                        Widget.Label({
                            className: 'overview-search-results-txt txt txt-norm',
                            label: name,
                        }),
                        Widget.Box({ hexpand: true }),
                        actionTextRevealer,
                    ]
                })
            ]
        }),
        setup: (self) => self
            .on('focus-in-event', (button) => {
                actionText.revealChild = true;
                actionTextRevealer.revealChild = true;
            })
            .on('focus-out-event', (button) => {
                actionText.revealChild = false;
                actionTextRevealer.revealChild = false;
            })
        ,
    })
}

export const CalculationResultButton = ({ result, text }) => searchItem({
    materialIconName: 'calculate',
    name: `Math result`,
    actionName: "Copy",
    content: `${result}`,
    onActivate: () => {
        App.closeWindow('overview');
        execAsync(['wl-copy', `${result}`]).catch(print);
    },
});

// Function to find the desktop file location
const findDesktopFileLocation = (app) => {
    // Common locations for .desktop files
    const desktopLocations = [
        `${GLib.get_home_dir()}/.local/share/applications`,
        '/usr/share/applications',
        '/usr/local/share/applications',
        '/var/lib/flatpak/exports/share/applications',
        `${GLib.get_home_dir()}/.var/app/*/export/share/applications`
    ];

    // Try to get the desktop file path directly from the app object if available
    if (app.desktopFile) {
        return app.desktopFile;
    }

    // If not available, search in common locations
    for (const location of desktopLocations) {
        // Expand any glob patterns in the location
        let paths = [];
        try {
            if (location.includes('*')) {
                // Use glob expansion via shell
                const result = exec(['bash', '-c', `ls -d ${location} 2>/dev/null`]);
                if (result) {
                    paths = result.split('\n').filter(p => p.trim() !== '');
                }
            } else {
                paths = [location];
            }

            // Check each potential path
            for (const path of paths) {
                const desktopFilePath = `${path}/${app.id}`;
                if (Utils.fileExists(desktopFilePath)) {
                    return desktopFilePath;
                }
            }
        } catch (error) {
            console.error(`Error searching in ${location}: ${error}`);
        }
    }

    // If we can't find it, return a default location with the app ID
    return `/usr/share/applications/${app.id}`;
};

export const DesktopEntryButton = (app) => {
    const actionText = Widget.Revealer({
        revealChild: false,
        transition: "crossfade",
        transitionDuration: userOptions.animations.durationLarge,
        child: Widget.Label({
            className: 'overview-search-results-txt txt txt-small txt-action',
            label: 'Launch',
        })
    });
    const actionTextRevealer = Widget.Revealer({
        revealChild: false,
        transition: "slide_left",
        transitionDuration: userOptions.animations.durationSmall,
        child: actionText,
    });
    return Widget.Button({
        className: 'overview-search-result-btn',
        onClicked: () => {
            App.closeWindow('overview');
            app.launch();
        },
        onSecondaryClick: (button) => {
            const desktopFilePath = findDesktopFileLocation(app);
            const directoryPath = desktopFilePath.substring(0, desktopFilePath.lastIndexOf('/'));

            const menu = Widget.Menu({
                className: 'menu',
                children: [
                    Widget.MenuItem({
                        child: Widget.Label({
                            xalign: 0,
                            label: "Open .desktop file location",
                        }),
                        onActivate: () => {
                            App.closeWindow('overview');
                            execAsync(['bash', '-c', `xdg-open '${directoryPath}' &`]).catch(print);
                        },
                    }),
                    Widget.MenuItem({
                        child: Widget.Label({
                            xalign: 0,
                            label: "Copy .desktop file path",
                        }),
                        onActivate: () => {
                            execAsync(['wl-copy', desktopFilePath]).catch(print);
                        },
                    }),
                ],
            });

            menu.popup_at_widget(button, Gravity.SOUTH, Gravity.NORTH, null);
            button.connect("destroy", () => menu.destroy());
        },
        child: Widget.Box({
            children: [
                Widget.Box({
                    vertical: false,
                    children: [
                        Widget.Box({
                            className: 'overview-search-results-icon',
                            homogeneous: true,
                            child: Widget.Icon({
                                icon: app.iconName,
                            }),
                        }),
                        Widget.Label({
                            className: 'overview-search-results-txt txt txt-norm',
                            label: app.name,
                        }),
                        Widget.Box({ hexpand: true }),
                        actionTextRevealer,
                    ]
                })
            ]
        }),
        setup: (self) => self
            .on('focus-in-event', () => {
                actionText.revealChild = true;
                actionTextRevealer.revealChild = true;
            })
            .on('focus-out-event', () => {
                actionText.revealChild = false;
                actionTextRevealer.revealChild = false;
            })
        ,
    })
}

export const ExecuteCommandButton = ({ command, terminal = false }) => searchItem({
    materialIconName: `${terminal ? 'terminal' : 'settings_b_roll'}`,
    name: `Run command`,
    actionName: `Execute ${terminal ? 'in terminal' : ''}`,
    content: `${command}`,
    onActivate: () => execAndClose(command, terminal),
    extraClassName: 'techfont',
})

export const CustomCommandButton = ({ text = '' }) => searchItem({
    materialIconName: 'settings_suggest',
    name: 'Action',
    actionName: 'Run',
    content: `${text}`,
    onActivate: () => {
        App.closeWindow('overview');
        launchCustomCommand(text);
    },
});

export const SearchButton = ({ text = '' }) => searchItem({
    materialIconName: 'travel_explore',
    name: 'Search the web',
    actionName: 'Go',
    content: `${text}`,
    onActivate: () => {
        App.closeWindow('overview');
        let search = userOptions.search.engineBaseUrl + text;
        for (let site of userOptions.search.excludedSites) {
            if (site) search += ` -site:${site}`;
        }
        execAsync(['bash', '-c', `xdg-open '${search}' &`]).catch(print);
    },
});

export const AiButton = ({ text }) => searchItem({
    materialIconName: 'chat_paste_go',
    name: 'Ask Gemini',
    actionName: 'Ask',
    content: `${text}`,
    onActivate: () => {
        GeminiService.send(text);
        App.closeWindow('overview');
        App.openWindow('sideleft');
    },
});

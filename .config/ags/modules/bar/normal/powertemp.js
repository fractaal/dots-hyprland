// Power usage and temperature widget for the bar
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
const { Box, Label, Button, Overlay, Revealer, Scrollable, Stack, EventBox } = Widget;
const { exec, execAsync } = Utils;
const { GLib } = imports.gi;
const { byteArray } = imports;
import { MaterialIcon } from '../../.commonwidgets/materialicon.js';
import { setupCursorHover } from '../../.widgetutils/cursorhover.js';
import { truncateToPrecision } from '../../.miscutils/mathfuncs.js';
import { AnimatedCircProg } from "../../.commonwidgets/cairo_circularprogress.js";
import Battery from 'resource:///com/github/Aylur/ags/service/battery.js';

// Maximum power consumption to use for percentage calculation (in watts)
const MAX_POWER_CONSUMPTION = 60;

// Function to read power consumption from battery
const getPowerConsumption = () => {
    try {
        const powerNow = parseInt(Utils.exec('cat /sys/class/power_supply/BAT0/power_now'));
        // Convert from microwatts to watts and round to 1 decimal place
        return truncateToPrecision(powerNow / 1000000, 1);
    } catch (error) {
        console.error('Error reading power consumption:', error);
        return 0;
    }
};

// Create a reusable function for bar resources with circular progress indicators
// Similar to the one in music.js but adapted for our needs
const BarResource = (name, icon, command, circprogClassName, textClassName, iconClassName) => {
    const resourceCircProg = AnimatedCircProg({
        className: `${circprogClassName}`,
        vpack: 'center',
        hpack: 'center',
    });

    const resourceProgress = Box({
        homogeneous: true,
        children: [Overlay({
            child: Box({
                vpack: 'center',
                className: `${iconClassName}`,
                homogeneous: true,
                children: [
                    MaterialIcon(icon, 'small'),
                ],
            }),
            overlays: [resourceCircProg]
        })]
    });

    const resourceLabel = Label({
        className: `txt-smallie ${textClassName}`,
    });

    const widget = Box({
        className: `spacing-h-5`,
        children: [
            resourceProgress,
            resourceLabel,
        ],
        setup: (self) => self.poll(2000, () => execAsync(['bash', '-c', command])
            .then((output) => {
                // Make sure we have a valid number for the circular progress
                const numValue = Number(output.trim());
                resourceCircProg.css = `font-size: ${isNaN(numValue) ? 0 : numValue}px;`;

                // Set the label text
                if (name === 'Power') {
                    const powerValue = getPowerConsumption();
                    resourceLabel.label = `${powerValue}W`;
                } else if (name === 'CPU Temp') {
                    try {
                        // Read temperature directly from the file using GLib.file_get_contents
                        // This is more reliable than exec for file operations
                        const [success, contents] = GLib.file_get_contents('/sys/class/thermal/thermal_zone0/temp');

                        if (success) {
                            // Convert the buffer to a string and parse it
                            const tempStr = imports.byteArray.toString(contents).trim();
                            const tempValue = parseInt(tempStr);

                            console.log("CPU temp raw:", tempStr, "parsed:", tempValue);

                            if (!isNaN(tempValue) && tempValue > 0) {
                                // Convert from millidegrees to degrees
                                const tempCelsius = tempValue / 1000;
                                resourceLabel.label = `${tempCelsius.toFixed(1)}°C`;

                                // Update the circular progress with the temperature percentage (assuming max temp of 100°C)
                                const tempPercentage = Math.min(Math.max(tempCelsius, 0), 100);
                                resourceCircProg.css = `font-size: ${tempPercentage}px;`;
                            } else {
                                resourceLabel.label = `0.0°C`;
                                resourceCircProg.css = `font-size: 0px;`;
                            }
                        } else {
                            console.error('Failed to read temperature file');
                            resourceLabel.label = `0.0°C`;
                            resourceCircProg.css = `font-size: 0px;`;
                        }
                    } catch (error) {
                        console.error('Error reading CPU temperature:', error);
                        resourceLabel.label = `0.0°C`;
                        resourceCircProg.css = `font-size: 0px;`;
                    }
                } else if (name === 'GPU Temp') {
                    if (Utils.exec('[ -f /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input ] && echo 1 || echo 0').trim() === '1') {
                        const temp = Utils.exec('cat /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input 2>/dev/null || echo 0');
                        const tempValue = parseInt(temp.trim()) / 1000;
                        resourceLabel.label = `${tempValue.toFixed(1)}°C`;
                    } else {
                        const temp = Utils.exec('nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null || echo 0');
                        resourceLabel.label = `${temp.trim()}°C`;
                    }
                }

                // Special handling for power widget when charging
                if (name === 'Power') {
                    // Use the battery low class for charging indication
                    resourceProgress.children[0].child.toggleClassName('bar-batt-low', Battery.charging);
                    resourceCircProg.toggleClassName('bar-batt-circprog-low', Battery.charging);
                }

                // Special handling for temperature widgets when hot
                if (name === 'CPU Temp' || name === 'GPU Temp') {
                    const isHot = Number(output) > 80;
                    // Use existing classes for high temperature indication
                    if (name === 'CPU Temp') {
                        resourceProgress.children[0].child.toggleClassName('bar-ram-icon-hot', isHot);
                        resourceCircProg.toggleClassName('bar-ram-circprog-hot', isHot);
                    } else {
                        resourceProgress.children[0].child.toggleClassName('bar-swap-icon-hot', isHot);
                        resourceCircProg.toggleClassName('bar-swap-circprog-hot', isHot);
                    }
                }
            }).catch(print))
        ,
    });

    return widget;
};

// Main widget that combines power and temperature
const PowerTempWidget = () => {
    // Check if GPU temperature is available
    const gpuTempAvailable = () => {
        try {
            // Try AMD GPU
            const amdOutput = Utils.exec('cat /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input 2>/dev/null');
            if (amdOutput.trim()) return true;

            // Try NVIDIA GPU
            const nvOutput = Utils.exec('nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null');
            if (nvOutput.trim()) return true;

            return false;
        } catch (error) {
            return false;
        }
    };

    const hasGpuTemp = gpuTempAvailable();

    // Create power widget
    const powerWidget = BarResource(
        'Power',
        'bolt',
        `power=$(cat /sys/class/power_supply/BAT0/power_now 2>/dev/null || echo 0);
         value=$(echo "scale=0; $power * 100 / 1000000 / ${MAX_POWER_CONSUMPTION}" | bc);
         echo $value`,
        `bar-cpu-circprog ${userOptions.appearance.borderless ? 'bar-cpu-circprog-borderless' : ''}`,
        'bar-cpu-txt',
        'bar-cpu-icon'
    );

    // Create CPU temperature widget
    const cpuTempWidget = BarResource(
        'CPU Temp',
        'memory',
        `bash -c "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf \"%.0f\", \$1/1000}' || echo 0"`,
        `bar-ram-circprog ${userOptions.appearance.borderless ? 'bar-ram-circprog-borderless' : ''}`,
        'bar-ram-txt',
        'bar-ram-icon'
    );

    // Create GPU temperature widget if available
    const gpuTempWidget = hasGpuTemp ? BarResource(
        'GPU Temp',
        'view_in_ar',
        `
        if [ -f /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input ]; then
            temp=$(cat /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input 2>/dev/null || echo 0)
            value=$(echo "scale=0; $temp / 1000" | bc)
            echo $value
        else
            nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null
        fi
        `,
        `bar-swap-circprog ${userOptions.appearance.borderless ? 'bar-swap-circprog-borderless' : ''}`,
        'bar-swap-txt',
        'bar-swap-icon'
    ) : null;

    return Box({
        className: 'bar-group-margin bar-sides',
        children: [
            Box({
                className: `bar-group${userOptions.appearance.borderless ? '-borderless' : ''} bar-group-standalone bar-group-pad-system`,
                children: [
                    Box({
                        className: 'spacing-h-15',
                        children: [
                            powerWidget,
                            Box({
                                className: 'spacing-h-10',
                                children: [
                                    cpuTempWidget,
                                    hasGpuTemp ? gpuTempWidget : null,
                                ].filter(Boolean),
                            }),
                        ],
                    }),
                ],
            }),
        ],
        setup: setupCursorHover,
    });
};

export default PowerTempWidget;

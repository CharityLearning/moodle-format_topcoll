// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Collapsed Topics Course index main component.
 *
 * @module     format_topcoll/local/content
 * @class      format_topcoll/local/content
 * @copyright  2022 G J Barnard based upon work done by:
 * @copyright  2020 Ferran Recio <ferran@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import Component from 'core_courseformat/local/content';
import {getCurrentCourseEditor} from 'core_courseformat/courseeditor';
import TopcollDispatchActions from 'format_topcoll/local/content/actions';
import * as CourseEvents from 'core_course/events';

export default class TopcollComponent extends Component {

    /**
     * Constructor hook.
     *
     * @param {Object} descriptor the component descriptor
     */
    create(descriptor) {
        super.create(descriptor);
    }

    /**
     * Static method to create a component instance form the mustahce template.
     *
     * @param {string} target the DOM main element or its ID
     * @param {object} selectors optional css selector overrides
     * @param {number} sectionReturn the content section return
     * @return {Component}
     */
    static init(target, selectors, sectionReturn) {
        return new TopcollComponent({
            element: document.getElementById(target),
            reactive: getCurrentCourseEditor(),
            selectors,
            sectionReturn,
        });
    }

    /**
     * Initial state ready method.
     */
    stateReady() {
        this._indexContents();

        if (this.reactive.supportComponents) {
            // Actions are only available in edit mode.
            if (this.reactive.isEditing) {
                new TopcollDispatchActions(this);
            }

            // Mark content as state ready.
            this.element.classList.add(this.classes.STATEDREADY);
        }

        // Capture completion events.
        this.addEventListener(
            this.element,
            CourseEvents.manualCompletionToggled,
            this._completionHandler
        );

        // Capture page scroll to update page item.
        this.addEventListener(
            document,
            "scroll",
            this._scrollHandler
        );
    }

    /**
     * Return the component watchers.
     *
     * @returns {Array} of watchers
     */
    getWatchers() {
        // Section return is a global page variable but most formats define it just before start printing
        // the course content. This is the reason why we define this page setting here.
        this.reactive.sectionReturn = this.sectionReturn;

        // Check if the course format is compatible with reactive components.
        if (!this.reactive.supportComponents) {
            return [];
        }
        return [
            // State changes that require to reload some course modules.
            {watch: `cm.visible:updated`, handler: this._reloadCm},
            {watch: `cm.stealth:updated`, handler: this._reloadCm},
            {watch: `cm.sectionid:updated`, handler: this._reloadCm},
            {watch: `cm.indent:updated`, handler: this._reloadCm},
            {watch: `cm.groupmode:updated`, handler: this._reloadCm},
            {watch: `cm.name:updated`, handler: this._refreshCmName},
            // Update section number and title.
            {watch: `section.number:updated`, handler: this._refreshSectionNumber},
            {watch: `section.title:updated`, handler: this._refreshSectionTitle},
            // Sections and cm sorting.
            {watch: `transaction:start`, handler: this._startProcessing},
            {watch: `course.sectionlist:updated`, handler: this._refreshCourseSectionlist},
            {watch: `section.cmlist:updated`, handler: this._refreshSectionCmlist},
            // Section visibility.
            {watch: `section.visible:updated`, handler: this._reloadSection},
            // Reindex sections and cms.
            {watch: `state:updated`, handler: this._indexContents},
        ];
    }

    /**
     * Refresh the section list.
     *
     * @param {Object} param
     * @param {Object} param.state the full state object.
     */
    _refreshCourseSectionlist({state}) {
        // If we have a section return means we only show a single section so no need to fix order.
        if (this.reactive.sectionReturn !== null) {
            return;
        }
        const sectionlist = this.reactive.getExporter().listedSectionIds(state);
        const listparent = this.getElement(this.selectors.COURSE_SECTIONLIST);
        // For now section cannot be created at a frontend level.
        const createSection = this._createSectionItem.bind(this);
        if (listparent) {
            this._fixTopcollSectionOrder(listparent, sectionlist, this.selectors.SECTION, this.dettachedSections, createSection);
        }
    }

    /**
     * Fix/reorder the section or cms order.
     *
     * @param {Element} container the HTML element to reorder.
     * @param {Array} neworder an array with the ids order
     * @param {string} selector the element selector
     * @param {Object} dettachedelements a list of dettached elements
     * @param {function} createMethod method to create missing elements
     */
    async _fixTopcollSectionOrder(container, neworder, selector, dettachedelements, createMethod) {
        if (container === undefined) {
            return;
        }

        // Empty lists should not be visible.
        if (!neworder.length) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        // Grant the list is visible (in case it was empty).
        container.classList.remove('hidden');

        // Move the elements in order at the beginning of the list.
        neworder.forEach((itemid, index) => {
            let item = this.getElement(selector, itemid) ?? dettachedelements[itemid] ?? createMethod(container, itemid);
            if (!item) {
                // Missing elements cannot be sorted.
                return;
            }
            let itemno = this.getElement('#tcnoid-'+itemid);
            if (itemno) {
                itemno.textContent = index + 1; // Update the section number in the 'left' part.
            }
            // Get the current elemnt at that position.
            const currentitem = container.children[index];
            if (!currentitem) {
                container.append(item);
                return;
            }
            if (currentitem !== item) {
                container.insertBefore(item, currentitem);
            }
        });

        // Dndupload add a fake element we need to keep.
        let dndFakeActivity;

        // Remove the remaining elements.
        while (container.children.length > neworder.length) {
            const lastchild = container.lastChild;
            if (lastchild?.classList?.contains('dndupload-preview')) {
                dndFakeActivity = lastchild;
            } else {
                dettachedelements[lastchild?.dataset?.id ?? 0] = lastchild;
            }
            container.removeChild(lastchild);
        }
        // Restore dndupload fake element.
        if (dndFakeActivity) {
            container.append(dndFakeActivity);
        }
    }
}

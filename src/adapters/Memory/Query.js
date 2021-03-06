import _ from 'lodash';
import P from 'bluebird';

import Query from '../../Query';

import MemoryFunctions from './Functions';

export default class MemoryQuery extends Query {
  constructor(givenOptions) {
    const options = {
      functionsClass: MemoryFunctions,
      ...givenOptions
    };

    super(options);

    this.data = this.adapter.getConnection();

    this.builder = _(this.data);

    if (this.collection) {
      this.table(this.collection.table);
    }
  }

  from(table) {
    this._from = table;

    return this;
  }

  select(...args) {
    if (typeof this._fields === 'undefined') {
      this._fields = [];
    }

    if (typeof this._mapFields === 'undefined') {
      this._mapFields = {};
    }

    if (typeof this._funcFields === 'undefined') {
      this._fieldFuncs = {};
    }

    if (args.length === 0) {
      return this;
    }

    args.forEach((arg) => {
      this._select(arg);
    });

    return this;
  }

  _select(field) {
    if (typeof field === 'string') {
      this._fields.push(field);
    } else if (_.isArray(field)) {
      field.forEach((f) => {
        this._fields.push(f);
      });
    } else if (typeof field === 'object') {
      _.each(field, (f, as) => {
        if (typeof f !== 'object' && typeof f !== 'function') {
          this._mapFields[f] = as;

          return;
        }

        let funcsList;
        let fieldName;

        if (typeof f === 'object' && f instanceof MemoryFunctions) {
          fieldName = f.getColumn();
          funcsList = f.getFunctions();
        } else if (typeof f === 'function') {
          const func = this.func.bind(this);
          fieldName = f.bind(this)(func).getColumn();
          funcsList = f.bind(this)(func).getFunctions();
        }

        this._fieldFuncs[fieldName] = {
          as,
          funcs: funcsList
        };
      });
    }

    return this;
  }

  where(conditions) {
    this._where = conditions;

    return this;
  }

  groupBy(givenColumns) {
    const columns = _.isString(givenColumns) ? [givenColumns] : givenColumns;

    this._groupBy = columns;

    return this;
  }

  orderBy(orderBy) {
    this._orderBy = orderBy;

    return this;
  }

  offset(offset) {
    this._offset = offset;

    return this;
  }

  limit(limit) {
    this._limit = limit;

    return this;
  }

  page(page) {
    if (typeof this._limit === 'undefined') {
      return this;
    }

    const offset = (page - 1) * this._limit;
    this.offset(offset);

    return this;
  }

  create(row) {
    this._create = _.isArray(row) ? row : [row];

    return this;
  }

  update(row) {
    this._update = _.isArray(row) ? row : [row];

    return this;
  }

  delete() {
    this._delete = true;

    return this;
  }

  table(table) {
    this._table = table;

    return this;
  }

  count() {
    this._count = true;

    return this;
  }

  all() {
    this._all = true;

    return this.run();
  }

  first() {
    this._first = true;

    return this.run();
  }

  run() {
    let value;

    if (!this._create && !this._update && !this._delete) {
      value = this._runRead();
    } else if (this._create) {
      value = this._runCreate();
    } else if (this._update) {
      value = this._runUpdate();
    } else if (this._delete) {
      value = this._runDelete();
    }

    return new P.resolve(value);
  }

  _runDelete() {
    const table = this._table;

    let tableRows = this.adapter.getData(table);
    if (typeof tableRows === 'undefined') {
      tableRows = [];
    }

    const k = _.findIndex(tableRows, this._where);
    const removed = tableRows.splice(k, 1);

    this.adapter.setData(table, tableRows);

    return removed.length;
  }

  _runUpdate() {
    const table = this._table;
    const ids = [];

    let tableRows = this.adapter.getData(table);
    if (typeof tableRows === 'undefined') {
      tableRows = [];
    }

    const k = _.findIndex(tableRows, this._where);
    const row = {
      ...tableRows[k],
      ...this._update
    };
    ids.push(row.id); // @TODO: use collection.primaryKey

    this.adapter.setData(`${table}.${k}`, row);

    return ids;
  }

  _runCreate() {
    const ids = [];
    const table = this._table;

    this._create.forEach((row) => {
      let tableRows = this.adapter.getData(table);

      if (typeof tableRows === 'undefined') {
        tableRows = [];
      }

      if (!row.id) {
        row.id = _.uniqueId(); // @TODO: improve this
      }

      tableRows.push({
        ...row
      });

      this.adapter.setData(table, tableRows);
      ids.push(row.id); // @TODO: use collection.primaryKey
    });

    return ids; // IDs
  }

  _runRead() {
    const results = this.builder
      .thru((data) => {
        // from
        if (!this._from) {
          return data;
        }

        if (typeof data[this._from] !== 'undefined') {
          return data[this._from];
        }

        return [];
      })
      .thru((data) => {
        // conditions
        if (!this._where) {
          return data;
        }

        return _.filter(data, _.matches(this._where));
      })
      .thru((data) => {
        // ordering
        if (!this._orderBy) {
          return data;
        }

        return _.sortByOrder(data, _.keys(this._orderBy), _.values(this._orderBy));
      })
      .thru((data) => {
        // grouping
        if (!this._groupBy) {
          return data;
        }

        const column = _.first(this._groupBy);
        const grouped = _.groupBy(data, (row) => {
          return row[column];
        });

        const results = [];
        _.each(grouped, (rows) => {
          results.push(rows[0]);
        });

        return results;
      })
      .thru((givenData) => {
        // offset and limit
        let data;

        if (this._offset && this._limit) {
          data = givenData.slice(this._offset, this._limit + 1);
        } else if (this._limit) {
          data = givenData.slice(0, this._limit);
        } else {
          data = givenData;
        }

        return data;
      })
      .thru((data) => {
        // select
        if (!data || (!this._fields && !this._mapFields && !this._fieldFuncs)) {
          return data;
        }

        let rows = data;

        // mapped fields
        rows = _.map(rows, (row) => {
          _.each(this._mapFields, (as, f) => {
            row[as] = row[f];
          });

          _.each(this._fieldFuncs, (fieldFunc, f) => {
            const {as, funcs} = fieldFunc;

            let val = row[f];
            funcs.forEach((func) => {
              if (typeof _[func] === 'function') {
                val = _[func](val);

                return;
              }

              if (func === 'concat') {
                val = '';
                this._concat.forEach((concatColumn) => {
                  if (concatColumn.indexOf('"') > -1) {
                    val += JSON.parse(concatColumn);

                    return;
                  }

                  val += row[concatColumn];
                });

                return;
              }

              val = String(val)[func]();
            });

            row[as] = val;
          });

          return row;
        });

        // pick the fields
        const pickFields = this._fields
          .concat(_.values(this._mapFields))
          .concat(_.map(this._fieldFuncs, item => item.as));

        if (pickFields.length > 0) {
          rows = _.map(rows, (row) => {
            return _.pick(row, pickFields);
          });
        }

        return rows;
      })
      .thru((data) => {
        // all or first
        if (!this._first) {
          return data;
        }

        if (typeof data[0] !== 'undefined') {
          return data[0];
        }

        return null;
      })
      .value();

    if (this._count) {
      return results.length;
    }

    if (!this._all && !this._first) {
      return results;
    }

    return this.toModels(results);
  }
}
